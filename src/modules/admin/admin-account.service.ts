import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import {
  AccountFootprintService,
  isEmptyFootprint,
} from "@modules/user/account-footprint.service";
import { AccountIdentityService } from "@modules/user/account-identity.service";
import { AccountMergeService } from "@modules/user/account-merge.service";
import { UserSignInRepository } from "@modules/user/user-sign-in.repository";
import { AccountRecord, UserRepository } from "@modules/user/user.repository";
import { UserRole } from "@modules/user/user.schema";
import { UserService } from "@modules/user/user.service";
import { Injectable } from "@nestjs/common";
import { AdminAuditRepository } from "./admin-audit.repository";
import { AccountNoteDto, TransferAccountDto } from "./admin.dto";

export interface AccountDescription {
  profileId: string;
  displayName: string | null;
  joined: Date;
  lastLogin: Date;
  locked: boolean;
  signInCount: number;
  blockedSignInCount: number;
  empty: boolean;
  footprint: { collection: string; count: number }[];
}

@Injectable()
export class AdminAccountService {
  constructor(
    private readonly identity: AccountIdentityService,
    private readonly users: UserRepository,
    private readonly signIns: UserSignInRepository,
    private readonly userService: UserService,
    private readonly footprints: AccountFootprintService,
    private readonly audit: AdminAuditRepository,
    private readonly merges: AccountMergeService,
  ) {}

  async describe(profileId: string): Promise<AccountDescription> {
    this.requireInternalIds();
    const account = await this.requireAccount(profileId);
    const [reaching, footprint] = await Promise.all([
      this.reachingSignIns(account),
      this.footprints.footprint(account.accountId),
    ]);
    const blocked = reaching.filter((row) => row.blocked).length;
    return {
      profileId: account.profileId,
      displayName: account.displayName,
      joined: account.joined,
      lastLogin: account.lastLogin,
      locked: reaching.length > 0 && blocked === reaching.length,
      signInCount: reaching.length,
      blockedSignInCount: blocked,
      empty: isEmptyFootprint(footprint),
      footprint: footprint.filter((entry) => entry.count > 0),
    };
  }

  async lock(actor: string, dto: AccountNoteDto): Promise<{ locked: true; signIns: number }> {
    this.requireInternalIds();
    const account = await this.requireAccount(dto.profileId);
    await this.requireMayActOn(actor, account);

    const reaching = await this.reachingSignIns(account);
    for (const { signIn } of reaching) {
      await this.signIns.block(signIn, account.accountId, new Date());
      await this.userService.invalidateSignIn(signIn, account.accountId);
    }

    await this.audit.append({
      actor,
      action: "account.lock",
      target: account.accountId,
      details: {
        profileId: account.profileId,
        displayName: account.displayName,
        note: dto.note,
        signIns: reaching.map((row) => row.signIn),
      },
    });
    return { locked: true, signIns: reaching.length };
  }

  async unlock(actor: string, dto: AccountNoteDto): Promise<{ unlocked: true }> {
    this.requireInternalIds();
    const account = await this.requireAccount(dto.profileId);
    await this.requireMayActOn(actor, account);

    const rows = await this.signIns.listByAccount(account.accountId);
    await this.audit.append({
      actor,
      action: "account.unlock",
      target: account.accountId,
      details: {
        profileId: account.profileId,
        displayName: account.displayName,
        note: dto.note,
        signIns: rows.map((row) => ({ signIn: row.signIn, blocked: row.blocked })),
      },
    });

    for (const row of rows) {
      if (row.signIn === account.signIn) {
        await this.signIns.remove(row.signIn, account.accountId);
      } else {
        await this.signIns.unblock(row.signIn, account.accountId);
      }
      await this.userService.invalidateSignIn(row.signIn, account.accountId);
    }
    return { unlocked: true };
  }

  async transfer(
    actor: string,
    dto: TransferAccountDto,
  ): Promise<{ transferred: true }> {
    this.requireInternalIds();
    const fresh = await this.requireAccount(dto.newAccountProfileId);
    const existing = await this.requireAccount(dto.existingAccountProfileId);
    if (fresh.accountId === existing.accountId) {
      throw new PDZError(ErrorCodes.USER.TRANSFER_SAME_ACCOUNT);
    }
    if (actor === fresh.accountId) {
      throw new PDZError(ErrorCodes.USER.CANNOT_ACT_ON_SELF);
    }
    await this.requireMayActOn(actor, existing);

    const ownRow = await this.signIns.find(fresh.signIn);
    if (ownRow?.blocked) {
      throw new PDZError(ErrorCodes.USER.TRANSFER_NEW_ACCOUNT_BLOCKED);
    }
    const pointing = await this.signIns.listByAccount(fresh.accountId);
    if (pointing.length > 0) {
      throw new PDZError(ErrorCodes.USER.TRANSFER_NEW_ACCOUNT_HAS_SIGN_INS);
    }
    if (ownRow) {
      throw new PDZError(ErrorCodes.USER.TRANSFER_NEW_ACCOUNT_REDIRECTED);
    }
    if (!(await this.footprints.isEmpty(fresh.accountId))) {
      throw new PDZError(ErrorCodes.USER.TRANSFER_NEW_ACCOUNT_NOT_EMPTY);
    }

    const auditId = await this.audit.append({
      actor,
      action: "account.transfer",
      target: existing.accountId,
      details: {
        note: dto.note,
        state: "started",
        newAccountProfileId: fresh.profileId,
        newAccountDisplayName: fresh.displayName,
        existingAccountProfileId: existing.profileId,
        existingAccountDisplayName: existing.displayName,
        newAccountId: fresh.accountId,
        signIn: fresh.signIn,
        signInRowBefore: null,
        signInRowAfter: { accountId: existing.accountId, blocked: false },
        removedUser: snapshot(fresh),
      },
    });

    let pointed = false;
    try {
      pointed = await this.signIns.point(fresh.signIn, existing.accountId);
      if (!pointed) {
        throw new PDZError(ErrorCodes.USER.TRANSFER_NEW_ACCOUNT_REDIRECTED);
      }
      await this.userService.invalidateSignIn(
        fresh.signIn,
        fresh.accountId,
        existing.accountId,
      );
      if (!(await this.footprints.isEmpty(fresh.accountId))) {
        throw new PDZError(ErrorCodes.USER.TRANSFER_NEW_ACCOUNT_NOT_EMPTY);
      }
    } catch (error) {
      await this.rollbackTransfer(fresh, existing, auditId, pointed);
      throw error;
    }

    await this.audit.patchDetails(auditId, { state: "applied" });
    await this.users.removeAccount(fresh.accountId, fresh.signIn);
    await this.userService.invalidateSignIn(
      fresh.signIn,
      fresh.accountId,
      existing.accountId,
    );
    return { transferred: true };
  }

  async undoTransfer(
    actor: string,
    dto: AccountNoteDto,
  ): Promise<{ undone: true }> {
    this.requireInternalIds();
    const existing = await this.requireAccount(dto.profileId);
    await this.requireMayActOn(actor, existing);

    const candidates = await this.audit.findOpenTransfers(existing.accountId);
    for (const candidate of candidates) {
      const signIn = candidate.details.signIn;
      if (typeof signIn !== "string") continue;
      const row = await this.signIns.find(signIn);
      if (!row || row.accountId !== existing.accountId) continue;

      await this.audit.append({
        actor,
        action: "account.transfer-undo",
        target: existing.accountId,
        details: {
          note: dto.note,
          transferAudit: candidate.id,
          signIn,
          signInRowBefore: { accountId: row.accountId, blocked: row.blocked },
          signInRowAfter: null,
        },
      });
      await this.signIns.remove(signIn, existing.accountId);
      const newAccountId = candidate.details.newAccountId;
      await this.userService.invalidateSignIn(
        signIn,
        existing.accountId,
        ...(typeof newAccountId === "string" ? [newAccountId] : []),
      );
      await this.audit.patchDetails(candidate.id, {
        undoneAt: new Date(),
        undoneBy: actor,
      });
      return { undone: true };
    }
    throw new PDZError(ErrorCodes.USER.NOTHING_TO_UNDO);
  }

  async undoMerge(
    actor: string,
    dto: AccountNoteDto,
  ): Promise<{ undone: true }> {
    this.requireInternalIds();
    const kept = await this.requireAccount(dto.profileId);
    await this.requireMayActOn(actor, kept);
    return this.merges.undo(actor, kept.accountId, dto.note);
  }

  private async rollbackTransfer(
    fresh: AccountRecord,
    existing: AccountRecord,
    auditId: string,
    pointed: boolean,
  ): Promise<void> {
    try {
      if (pointed) {
        await this.signIns.remove(fresh.signIn, existing.accountId);
        await this.userService.invalidateSignIn(
          fresh.signIn,
          fresh.accountId,
          existing.accountId,
        );
      }
      await this.audit.patchDetails(auditId, { state: "failed" });
    } catch {
      return;
    }
  }

  private async reachingSignIns(
    account: AccountRecord,
  ): Promise<{ signIn: string; blocked: boolean }[]> {
    const rows = await this.signIns.listByAccount(account.accountId);
    if (rows.some((row) => row.signIn === account.signIn)) return rows;
    const ownRow = await this.signIns.find(account.signIn);
    if (ownRow) return rows;
    return [{ signIn: account.signIn, blocked: false }, ...rows];
  }

  private requireInternalIds(): void {
    if (!this.identity.internal) {
      throw new PDZError(ErrorCodes.USER.ACCOUNT_TOOLS_UNAVAILABLE);
    }
  }

  private async requireAccount(profileId: string): Promise<AccountRecord> {
    const account = await this.users.findAccountByProfileId(profileId);
    if (!account) throw new PDZError(ErrorCodes.USER.ACCOUNT_NOT_FOUND);
    return account;
  }

  private async requireMayActOn(
    actor: string,
    target: AccountRecord,
  ): Promise<void> {
    if (actor === target.accountId) {
      throw new PDZError(ErrorCodes.USER.CANNOT_ACT_ON_SELF);
    }
    const protectedAccount = target.roles.some(
      (role) => role === UserRole.OWNER || role === UserRole.ADMIN,
    );
    if (!protectedAccount) return;
    const me = await this.userService.getMe(actor);
    if (!me.roles?.includes(UserRole.OWNER)) {
      throw new PDZError(ErrorCodes.USER.OWNER_REQUIRED);
    }
  }
}

function snapshot(account: AccountRecord): Record<string, unknown> {
  return {
    profileId: account.profileId,
    displayName: account.displayName,
    settings: account.settings,
    profile: account.profile,
    privateProfile: account.privateProfile,
    joined: account.joined,
  };
}
