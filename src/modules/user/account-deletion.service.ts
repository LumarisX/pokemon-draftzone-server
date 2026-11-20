import { AppCacheService } from "@core/cache/app-cache.service";
import { CacheKeys } from "@core/cache/cache-keys";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { AdminAuditRepository } from "@modules/admin/admin-audit.repository";
import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import { AccountIdentityService } from "./account-identity.service";
import {
  applyAccountIdChanges,
  scanAccountIds,
} from "./account-id-rewriter";
import {
  AccountDeletionRepository,
  PENDING_AUTH0_DELETIONS,
  TournamentRef,
} from "./account-deletion.repository";
import { MERGE_SKIPPED_COLLECTIONS } from "./account-merge.service";
import { Auth0AccountClient } from "./auth0-account.client";
import { UserSignInRepository } from "./user-sign-in.repository";
import { TOMBSTONE_PREFIX } from "./user.identity";
import { DueDeletion, UserRepository } from "./user.repository";
import { UserService } from "./user.service";

export const DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export const DELETION_SKIPPED_COLLECTIONS: ReadonlySet<string> = new Set([
  ...MERGE_SKIPPED_COLLECTIONS,
  PENDING_AUTH0_DELETIONS,
]);

export type DeletionBlockerKind = "organizer" | "coach";

export interface DeletionBlocker extends TournamentRef {
  kind: DeletionBlockerKind;
}

export interface DeletionStatus {
  scheduledFor: string | null;
  blockers: DeletionBlocker[];
}

export interface DeletionRunResult {
  purged: number;
  blocked: number;
  failed: number;
}

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly identity: AccountIdentityService,
    private readonly users: UserRepository,
    private readonly signIns: UserSignInRepository,
    private readonly userService: UserService,
    private readonly repository: AccountDeletionRepository,
    private readonly audit: AdminAuditRepository,
    private readonly auth0: Auth0AccountClient,
    private readonly appCache: AppCacheService,
  ) {}

  async status(accountId: string): Promise<DeletionStatus> {
    const user = await this.users.getUserBySub(accountId);
    return {
      scheduledFor: user.deletion
        ? new Date(user.deletion.scheduledFor).toISOString()
        : null,
      blockers: await this.blockers(accountId),
    };
  }

  async schedule(
    accountId: string,
    now: Date = new Date(),
  ): Promise<{ scheduledFor: string }> {
    const user = await this.users.getUserBySub(accountId);
    if (user.deletion) {
      return { scheduledFor: new Date(user.deletion.scheduledFor).toISOString() };
    }
    const blockers = await this.blockers(accountId);
    if (blockers.length > 0) {
      throw new PDZError(ErrorCodes.USER.DELETION_BLOCKED, { blockers });
    }
    const scheduledFor = new Date(now.getTime() + DELETION_GRACE_MS);
    await this.users.applyChanges(accountId, {
      set: { deletion: { requestedAt: now, scheduledFor } },
    });
    await this.appCache.invalidate(CacheKeys.user(accountId));
    return { scheduledFor: scheduledFor.toISOString() };
  }

  async cancel(accountId: string): Promise<{ scheduledFor: null }> {
    const user = await this.users.getUserBySub(accountId);
    if (!user.deletion) return { scheduledFor: null };
    if (!(await this.users.cancelDeletion(accountId))) {
      throw new PDZError(ErrorCodes.USER.DELETION_IN_PROGRESS);
    }
    await this.appCache.invalidate(CacheKeys.user(accountId));
    return { scheduledFor: null };
  }

  async blockers(accountId: string): Promise<DeletionBlocker[]> {
    const [owned, staff, coaching] = await Promise.all([
      this.repository.openOwnedTournaments(accountId),
      this.repository.openStaffSeats(accountId),
      this.repository.openCoachSeats(accountId),
    ]);
    const blockers = new Map<string, DeletionBlocker>();
    const add = (kind: DeletionBlockerKind, seat: TournamentRef) => {
      const key = `${seat.leagueSlug}/${seat.tournamentSlug}`;
      if (!blockers.has(key)) blockers.set(key, { kind, ...seat });
    };
    [...owned, ...staff].forEach((seat) => add("organizer", seat));
    coaching.forEach((seat) => add("coach", seat));
    return [...blockers.values()];
  }

  async runDue(now: Date = new Date()): Promise<DeletionRunResult> {
    const result: DeletionRunResult = { purged: 0, blocked: 0, failed: 0 };
    await this.retryPendingAuth0(now);
    const due = await this.users.findDueDeletions(now);
    for (const deletion of due) {
      try {
        const outcome = await this.purge(deletion, now);
        if (outcome === "blocked") result.blocked++;
        else result.purged++;
      } catch (error) {
        result.failed++;
        this.logger.error(
          `Account deletion failed for profile ${deletion.profileId}; it stays scheduled`,
          error,
        );
      }
    }
    return result;
  }

  async purge(
    due: DueDeletion,
    now: Date = new Date(),
  ): Promise<"purged" | "blocked"> {
    if ((await this.blockers(due.accountId)).length > 0) {
      this.logger.warn(
        `Account deletion for profile ${due.profileId} is blocked again; it stays scheduled`,
      );
      return "blocked";
    }

    const tombstone =
      due.tombstone ?? `${TOMBSTONE_PREFIX}${randomBytes(12).toString("hex")}`;
    if (!due.tombstone) {
      await this.users.applyChanges(due.accountId, {
        set: { "deletion.tombstone": tombstone },
      });
    }

    const signIns = await this.signInsReaching(due);
    await this.repository.recordPendingAuth0(signIns, now);

    await this.repository.deleteOwnedRecords(due.accountId);
    await this.repository.purgeTierLists(due.accountId);
    await this.repository.scrubSharedRecords(due.accountId);
    await this.rewrite(due.accountId, tombstone);

    await this.signIns.removeAllByAccount(due.accountId);
    await this.users.removeAccount(due.accountId, due.signIn);

    await this.audit.append({
      actor: "system",
      action: "account.delete",
      target: tombstone,
      details: {
        profileId: due.profileId,
        requestedAt: due.requestedAt,
        deletedAt: now,
      },
    });

    for (const signIn of signIns) {
      await this.userService.invalidateSignIn(signIn, due.accountId);
    }
    await this.attemptAuth0(signIns, now);
    return "purged";
  }

  private async signInsReaching(due: DueDeletion): Promise<string[]> {
    const reaching = new Set<string>([due.signIn]);
    if (this.identity.internal) {
      for (const row of await this.signIns.listByAccount(due.accountId)) {
        reaching.add(row.signIn);
      }
    }
    return [...reaching];
  }

  private async rewrite(accountId: string, tombstone: string): Promise<void> {
    const store = this.repository.store();
    const scan = await scanAccountIds(
      store,
      new Map([[accountId, tombstone]]),
      { skip: DELETION_SKIPPED_COLLECTIONS },
    );
    if (scan.blockers.length > 0) {
      throw new Error(
        `Account ids cannot be rewritten: ${scan.blockers.slice(0, 5).join("; ")}`,
      );
    }
    await applyAccountIdChanges(store, scan.changes);
  }

  private async retryPendingAuth0(now: Date): Promise<void> {
    const pending = await this.repository.listPendingAuth0();
    await this.attemptAuth0(
      pending.map((row) => row.signIn),
      now,
    );
  }

  private async attemptAuth0(signIns: string[], now: Date): Promise<void> {
    for (const signIn of signIns) {
      try {
        await this.auth0.deleteUser(signIn);
        await this.repository.resolvePendingAuth0(signIn);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Auth0 user deletion failed and will be retried: ${message}`,
        );
        await this.repository.failPendingAuth0(signIn, message, now);
      }
    }
  }
}
