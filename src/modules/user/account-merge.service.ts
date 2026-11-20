import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { AdminAuditRepository } from "@modules/admin/admin-audit.repository";
import { Injectable, Logger } from "@nestjs/common";
import { AccountIdentityService } from "./account-identity.service";
import {
  applyAccountIdChanges,
  Doc,
  RewriteRecord,
  revertAccountIdChanges,
  scanAccountIds,
  toRewriteRecords,
} from "./account-id-rewriter";
import {
  AccountMergeRepository,
  EXTERNAL_DRAFTS,
  APPLICATIONS,
  IMPORT_ALIASES,
  PLANNER_PLANS,
} from "./account-merge.repository";
import { AccountMergeOfferService } from "./account-merge-offer.service";
import { UserSignInRepository } from "./user-sign-in.repository";
import { User } from "./user.domain";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

export type MergeKeep = "current" | "other";

export const MERGE_SKIPPED_COLLECTIONS: ReadonlySet<string> = new Set([
  "users",
  "usersignins",
  "adminaudits",
  "accountmergerecords",
]);

const PROFILE_FIELDS = ["gameName", "timezone"] as const;
const PLAN_NAME_MAX = 120;
const PROFILE_ID_PATTERN = /^[0-9a-f]{24}$/i;
const REDIRECT_DEPTH = 5;

interface PlanLike {
  draftName?: unknown;
  [key: string]: unknown;
}

export type CombineOp =
  | {
      type: "plans";
      keptDocId: unknown;
      key: string;
      added: PlanLike[];
      awayDoc: Doc;
    }
  | { type: "draft-slug"; id: unknown; from: string; to: string }
  | { type: "alias"; doc: Doc }
  | { type: "application"; doc: Doc };

export interface KeptChanges {
  rolesAdded: string[];
  filled: Record<string, string>;
  discord: {
    before: Doc | null;
    after: Doc;
  } | null;
}

export interface SignInChange {
  signIn: string;
  before: { accountId: string; blocked: boolean } | null;
}

export interface MergeState {
  fromId: string;
  toId: string;
  awayRow: Doc;
  combine: CombineOp[];
  records: RewriteRecord[] | null;
  keptChanges: KeptChanges | null;
  signInChanges: SignInChange[];
}

function planName(plan: PlanLike): string {
  return typeof plan.draftName === "string" ? plan.draftName : "";
}

function renamed(plan: PlanLike, taken: Set<string>): PlanLike {
  const name = planName(plan);
  if (!taken.has(name)) {
    taken.add(name);
    return plan;
  }
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${name.slice(0, PLAN_NAME_MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return { ...plan, draftName: candidate };
    }
  }
}

function rolesOf(row: Doc): string[] {
  return Array.isArray(row.roles) ? (row.roles as string[]) : [];
}

function profileOf(row: Doc): Doc {
  return (row.profile as Doc | undefined) ?? {};
}

@Injectable()
export class AccountMergeService {
  private readonly logger = new Logger(AccountMergeService.name);

  constructor(
    private readonly identity: AccountIdentityService,
    private readonly users: UserRepository,
    private readonly signIns: UserSignInRepository,
    private readonly userService: UserService,
    private readonly repository: AccountMergeRepository,
    private readonly offers: AccountMergeOfferService,
    private readonly audit: AdminAuditRepository,
  ) {}

  async merge(
    sub: string,
    token: string,
    keep: MergeKeep,
  ): Promise<{ user: User }> {
    if (!this.identity.internal) {
      throw new PDZError(ErrorCodes.USER.MERGE_UNAVAILABLE);
    }
    const offer = await this.offers.take(token);
    if (
      !offer ||
      offer.current !== sub ||
      new Date(offer.expiresAt).getTime() <= Date.now()
    ) {
      throw new PDZError(ErrorCodes.USER.MERGE_OFFER_INVALID);
    }
    const holder = await this.users.findDiscordHolder(offer.discordId);
    if (!holder || holder.accountId !== offer.other) {
      throw new PDZError(ErrorCodes.USER.MERGE_OFFER_INVALID);
    }
    const [currentRow, otherRow] = await Promise.all([
      this.users.findRawAccount(offer.current),
      this.users.findRawAccount(offer.other),
    ]);
    if (!currentRow || !otherRow) {
      throw new PDZError(ErrorCodes.USER.MERGE_OFFER_INVALID);
    }

    const blockers = await this.offers.blockers(offer.current, offer.other);
    if (blockers.length > 0) {
      await this.offers.store(token, offer);
      throw new PDZError(ErrorCodes.USER.MERGE_BLOCKED, { blockers });
    }

    const [fromRow, toRow] =
      keep === "current" ? [otherRow, currentRow] : [currentRow, otherRow];
    const fromId = String(fromRow._id);
    const toId = String(toRow._id);

    const state: MergeState = {
      fromId,
      toId,
      awayRow: fromRow,
      combine: [],
      records: null,
      keptChanges: null,
      signInChanges: [],
    };
    const auditId = await this.audit.append({
      actor: sub,
      action: "account.merge",
      target: toId,
      details: {
        state: "started",
        keep,
        fromAccountId: fromId,
        toAccountId: toId,
        fromDisplayName: fromRow.displayName ?? null,
        toDisplayName: toRow.displayName ?? null,
        discordId: offer.discordId,
        removedUser: fromRow,
      },
    });

    try {
      await this.combine(state);
      await this.audit.patchDetails(auditId, { combine: state.combine });

      await this.rewrite(auditId, state);
      await this.audit.patchDetails(auditId, {
        rewrittenDocuments: state.records?.length ?? 0,
      });

      await this.moveRow(state, toRow, offer.discordId);
      await this.audit.patchDetails(auditId, { keptChanges: state.keptChanges });

      await this.moveSignIns(state);
      await this.audit.patchDetails(auditId, {
        signInChanges: state.signInChanges,
      });

      await this.users.removeAccount(fromId, String(fromRow.auth0Sub));
    } catch (error) {
      const issues = await this.reverse(state, false);
      await this.safely(() =>
        this.audit.patchDetails(auditId, {
          state: "failed",
          failure: error instanceof Error ? error.message : String(error),
          notReversed: issues,
        }),
      );
      throw error;
    }

    await this.audit.patchDetails(auditId, { state: "applied" });
    await this.invalidate(state);
    return { user: await this.userService.getMeConnected(toId) };
  }

  async undo(
    actor: string,
    keptAccountId: string,
    note: string,
  ): Promise<{ undone: true }> {
    const candidates = await this.audit.findOpenMerges(keptAccountId);
    const candidate = candidates[0];
    if (!candidate) throw new PDZError(ErrorCodes.USER.NOTHING_TO_UNDO);

    const details = candidate.details;
    const fromId = String(details.fromAccountId);
    if (await this.users.findRawAccount(fromId)) {
      throw new PDZError(ErrorCodes.USER.MERGE_UNDO_CONFLICT);
    }

    const state: MergeState = {
      fromId,
      toId: keptAccountId,
      awayRow: details.removedUser as Doc,
      combine: (details.combine as CombineOp[] | undefined) ?? [],
      records: await this.repository.loadRecords(candidate.id),
      keptChanges: (details.keptChanges as KeptChanges | null | undefined) ?? null,
      signInChanges: (details.signInChanges as SignInChange[] | undefined) ?? [],
    };

    const undoId = await this.audit.append({
      actor,
      action: "account.merge-undo",
      target: keptAccountId,
      details: {
        note,
        mergeAudit: candidate.id,
        fromAccountId: fromId,
        toAccountId: keptAccountId,
      },
    });
    const issues = await this.reverse(state, true);
    await this.audit.patchDetails(undoId, { notReversed: issues });
    await this.audit.patchDetails(candidate.id, {
      undoneAt: new Date(),
      undoneBy: actor,
    });
    await this.invalidate(state);
    return { undone: true };
  }

  async keptProfileFor(profileId: unknown): Promise<string | null> {
    if (typeof profileId !== "string" || !PROFILE_ID_PATTERN.test(profileId)) {
      return null;
    }
    let current = profileId;
    for (let depth = 0; depth < REDIRECT_DEPTH; depth++) {
      const merge = await this.audit.findAppliedMergeFrom(current);
      if (!merge) break;
      current = merge.target;
    }
    return current === profileId ? null : current;
  }

  private async combine(state: MergeState): Promise<void> {
    await this.combinePlans(state);
    await this.combineDrafts(state);
    await this.combineAliases(state);
    await this.combineApplications(state);
  }

  private async combineApplications(state: MergeState): Promise<void> {
    const [awayApps, keptApps] = await Promise.all([
      this.repository.find(APPLICATIONS, { auth0Id: { $eq: state.fromId } }),
      this.repository.find(APPLICATIONS, { auth0Id: { $eq: state.toId } }),
    ]);
    const seated = (app: Doc) =>
      app.status === "approved" || Boolean(app.resultingCoachId);
    for (const away of awayApps) {
      const kept = keptApps.find(
        (app) => String(app.tournamentId) === String(away.tournamentId),
      );
      if (!kept) continue;
      const loser = seated(away) && !seated(kept) ? kept : away;
      state.combine.push({ type: "application", doc: loser });
      await this.repository.remove(APPLICATIONS, loser._id);
    }
  }

  private async combinePlans(state: MergeState): Promise<void> {
    const [awayDocs, keptDocs] = await Promise.all([
      this.repository.find(PLANNER_PLANS, { owner: { $eq: state.fromId } }),
      this.repository.find(PLANNER_PLANS, { owner: { $eq: state.toId } }),
    ]);
    for (const awayDoc of awayDocs) {
      const keptDoc = keptDocs.find((doc) => doc.key === awayDoc.key);
      if (!keptDoc) continue;
      const keptPlans = (keptDoc.plans as PlanLike[] | undefined) ?? [];
      const taken = new Set(keptPlans.map(planName));
      const added = ((awayDoc.plans as PlanLike[] | undefined) ?? []).map(
        (plan) => renamed(plan, taken),
      );
      state.combine.push({
        type: "plans",
        keptDocId: keptDoc._id,
        key: String(awayDoc.key),
        added,
        awayDoc,
      });
      await this.repository.setFields(
        PLANNER_PLANS,
        { _id: keptDoc._id },
        {
          plans: [...keptPlans, ...added],
          revision: Number(keptDoc.revision ?? 1) + 1,
        },
      );
      await this.repository.remove(PLANNER_PLANS, awayDoc._id);
    }
  }

  private async combineDrafts(state: MergeState): Promise<void> {
    const [awayDrafts, keptDrafts] = await Promise.all([
      this.repository.find(EXTERNAL_DRAFTS, { owner: { $eq: state.fromId } }),
      this.repository.find(EXTERNAL_DRAFTS, { owner: { $eq: state.toId } }),
    ]);
    const keptSlugs = new Set(keptDrafts.map((doc) => String(doc.slug)));
    const taken = new Set([
      ...keptSlugs,
      ...awayDrafts.map((doc) => String(doc.slug)),
    ]);
    for (const draft of awayDrafts) {
      const slug = String(draft.slug);
      if (!keptSlugs.has(slug)) continue;
      let n = 2;
      while (taken.has(`${slug}-${n}`)) n++;
      const to = `${slug}-${n}`;
      taken.add(to);
      state.combine.push({ type: "draft-slug", id: draft._id, from: slug, to });
      await this.repository.setFields(
        EXTERNAL_DRAFTS,
        { _id: draft._id },
        { slug: to },
      );
    }
  }

  private async combineAliases(state: MergeState): Promise<void> {
    const [awayAliases, keptAliases] = await Promise.all([
      this.repository.find(IMPORT_ALIASES, { owner: { $eq: state.fromId } }),
      this.repository.find(IMPORT_ALIASES, { owner: { $eq: state.toId } }),
    ]);
    const keptTexts = new Set(keptAliases.map((doc) => String(doc.text)));
    for (const alias of awayAliases) {
      if (!keptTexts.has(String(alias.text))) continue;
      state.combine.push({ type: "alias", doc: alias });
      await this.repository.remove(IMPORT_ALIASES, alias._id);
    }
  }

  private async rewrite(auditId: string, state: MergeState): Promise<void> {
    const store = this.repository.store();
    const scan = await scanAccountIds(
      store,
      new Map([[state.fromId, state.toId]]),
      { skip: MERGE_SKIPPED_COLLECTIONS },
    );
    if (scan.blockers.length > 0) {
      throw new Error(
        `Account ids cannot be rewritten: ${scan.blockers.slice(0, 5).join("; ")}`,
      );
    }
    const records = toRewriteRecords(scan.changes);
    await this.repository.saveRecords(auditId, records);
    state.records = records;
    await applyAccountIdChanges(store, scan.changes);
  }

  private async moveRow(
    state: MergeState,
    toRow: Doc,
    discordId: string,
  ): Promise<void> {
    const away = state.awayRow;
    const keptRoles = rolesOf(toRow);
    const rolesAdded = rolesOf(away).filter((role) => !keptRoles.includes(role));
    const keptProfile = profileOf(toRow);
    const awayProfile = profileOf(away);
    const set: Record<string, unknown> = {};
    const filled: Record<string, string> = {};
    const changes: KeptChanges = { rolesAdded, filled, discord: null };

    if (rolesAdded.length > 0) set.roles = [...keptRoles, ...rolesAdded];

    for (const field of PROFILE_FIELDS) {
      const value = awayProfile[field];
      if (!keptProfile[field] && typeof value === "string" && value) {
        set[`profile.${field}`] = value;
        filled[field] = value;
      }
    }

    const keptDiscord = (toRow.discord as Doc | undefined) ?? null;
    const awayDiscord = (away.discord as Doc | undefined) ?? null;
    let awayDiscordUnset = false;
    if (!keptDiscord || keptDiscord.id !== discordId) {
      const now = new Date();
      const after: Doc =
        awayDiscord && awayDiscord.id === discordId
          ? { ...awayDiscord }
          : {
              id: discordId,
              username: String(
                awayProfile.discordName ?? away.username ?? discordId,
              ),
              connectedAt: now,
              refreshedAt: new Date(0),
            };
      changes.discord = { before: keptDiscord, after };
      set.discord = after;
      awayDiscordUnset = awayDiscord !== null;
    }

    state.keptChanges = changes;
    if (awayDiscordUnset) {
      await this.users.applyChanges(state.fromId, { unset: ["discord"] });
    }
    if (Object.keys(set).length > 0) {
      await this.users.applyChanges(state.toId, { set });
    }
  }

  private async moveSignIns(state: MergeState): Promise<void> {
    const awaySignIn = String(state.awayRow.auth0Sub);
    const rows = await this.signIns.listByAccount(state.fromId);
    const changes: SignInChange[] = rows.map((row) => ({
      signIn: row.signIn,
      before: { accountId: row.accountId, blocked: row.blocked },
    }));
    if (!rows.some((row) => row.signIn === awaySignIn)) {
      const own = await this.signIns.find(awaySignIn);
      if (!own) changes.push({ signIn: awaySignIn, before: null });
    }
    for (const change of changes) {
      state.signInChanges.push(change);
      if (change.before === null) {
        await this.signIns.point(change.signIn, state.toId);
      } else {
        await this.signIns.repoint(change.signIn, state.fromId, state.toId);
      }
    }
  }

  private async reverse(
    state: MergeState,
    reportLost: boolean,
  ): Promise<string[]> {
    const issues: string[] = [];
    const step = async (label: string, run: () => Promise<void>) => {
      try {
        await run();
      } catch (error) {
        this.logger.error(`Merge reversal step failed: ${label}`, error);
        issues.push(
          `${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    await step("kept account fields", () => this.revertKeptRow(state));
    await step("merged-away account row", () =>
      this.users.restoreRawAccount(state.awayRow),
    );
    for (const change of [...state.signInChanges].reverse()) {
      await step(`sign-in ${change.signIn}`, async () => {
        if (change.before === null) {
          await this.signIns.remove(change.signIn, state.toId);
        } else {
          await this.signIns.repoint(change.signIn, state.toId, state.fromId);
        }
      });
    }
    if (state.records) {
      const records = state.records;
      await step("account ids", async () => {
        await revertAccountIdChanges(
          this.repository.store(),
          records,
          state.fromId,
          state.toId,
        );
      });
    }
    for (const op of [...state.combine].reverse()) {
      await step(`combined ${op.type}`, async () => {
        const lost = await this.revertCombine(op);
        if (reportLost && lost > 0) {
          issues.push(
            `${lost} merged-in plan(s) were changed or removed since the merge and stay in the kept account`,
          );
        }
      });
    }
    await step("caches", () => this.invalidate(state));
    return issues;
  }

  private async revertKeptRow(state: MergeState): Promise<void> {
    const changes = state.keptChanges;
    if (!changes) return;
    const row = await this.users.findRawAccount(state.toId);
    if (!row) return;
    const set: Record<string, unknown> = {};
    const unset: string[] = [];

    if (changes.rolesAdded.length > 0) {
      set.roles = rolesOf(row).filter((role) => !changes.rolesAdded.includes(role));
    }
    const profile = profileOf(row);
    for (const [field, value] of Object.entries(changes.filled)) {
      if (profile[field] === value) unset.push(`profile.${field}`);
    }
    const moved = changes.discord;
    if (moved) {
      const currentDiscord = (row.discord as Doc | undefined) ?? null;
      if (currentDiscord && currentDiscord.id === moved.after.id) {
        if (moved.before) set.discord = moved.before;
        else unset.push("discord");
      }
    }
    if (Object.keys(set).length === 0 && unset.length === 0) return;
    await this.users.applyChanges(state.toId, { set, unset });
  }

  private async revertCombine(op: CombineOp): Promise<number> {
    if (op.type === "plans") {
      const kept = (
        await this.repository.find(PLANNER_PLANS, { _id: op.keptDocId })
      )[0];
      let lost = 0;
      if (kept) {
        const remaining = [...((kept.plans as PlanLike[] | undefined) ?? [])];
        for (const added of op.added) {
          const index = remaining.findIndex(
            (plan) => JSON.stringify(plan) === JSON.stringify(added),
          );
          if (index === -1) lost++;
          else remaining.splice(index, 1);
        }
        if (remaining.length !== ((kept.plans as unknown[]) ?? []).length) {
          await this.repository.setFields(
            PLANNER_PLANS,
            { _id: op.keptDocId },
            {
              plans: remaining,
              revision: Number(kept.revision ?? 1) + 1,
            },
          );
        }
      }
      const existing = await this.repository.find(PLANNER_PLANS, {
        _id: op.awayDoc._id,
      });
      if (existing.length === 0) {
        await this.repository.insert(PLANNER_PLANS, op.awayDoc);
      }
      return lost;
    }
    if (op.type === "draft-slug") {
      await this.repository.setFields(
        EXTERNAL_DRAFTS,
        { _id: op.id, slug: op.to },
        { slug: op.from },
      );
      return 0;
    }
    const collection = op.type === "alias" ? IMPORT_ALIASES : APPLICATIONS;
    const existing = await this.repository.find(collection, {
      _id: op.doc._id,
    });
    if (existing.length === 0) await this.repository.insert(collection, op.doc);
    return 0;
  }

  private async invalidate(state: MergeState): Promise<void> {
    const signIns = new Set<string>([
      String(state.awayRow.auth0Sub),
      ...state.signInChanges.map((change) => change.signIn),
    ]);
    for (const signIn of signIns) {
      await this.userService.invalidateSignIn(signIn, state.fromId, state.toId);
    }
  }

  private async safely(run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error("Merge bookkeeping failed", error);
    }
  }
}
