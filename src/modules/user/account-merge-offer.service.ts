import { AppCacheService } from "@core/cache/app-cache.service";
import { CacheKeys } from "@core/cache/cache-keys";
import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { MAX_PLANS } from "@modules/planner/planner-plans.domain";
import { AccountIdentityService } from "./account-identity.service";
import { AccountMergeRepository, MergeCounts } from "./account-merge.repository";
import {
  displayNameOrFallback,
  SignInProvider,
  signInProvider,
} from "./user.identity";
import { UserRepository } from "./user.repository";

export const MERGE_OFFER_TTL_MS = 10 * 60_000;

export interface AccountSummary {
  profileId: string;
  displayName: string;
  joined: string;
  signInMethod: SignInProvider;
  counts: MergeCounts;
}

export interface MergeOffer {
  token: string;
  expiresAt: string;
  current: AccountSummary;
  other: AccountSummary;
  blockers: string[];
}

export interface StoredMergeOffer {
  current: string;
  other: string;
  discordId: string;
  expiresAt: string;
}

function bothNamed(names: Map<string, string>, id: string): string {
  return names.get(id) ?? "a tournament";
}

function plannerName(key: string): string {
  const tournament = key.split("/")[1];
  return tournament ? `the ${tournament} planner` : "the free planner";
}

@Injectable()
export class AccountMergeOfferService {
  constructor(
    private readonly identity: AccountIdentityService,
    private readonly users: UserRepository,
    private readonly repository: AccountMergeRepository,
    private readonly appCache: AppCacheService,
  ) {}

  async create(
    current: string,
    other: string,
    discordId: string,
  ): Promise<MergeOffer | null> {
    if (!this.identity.internal) return null;
    const [currentSummary, otherSummary] = await Promise.all([
      this.summarize(current),
      this.summarize(other),
    ]);
    if (!currentSummary || !otherSummary) return null;

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + MERGE_OFFER_TTL_MS).toISOString();
    await this.store(token, { current, other, discordId, expiresAt });
    return {
      token,
      expiresAt,
      current: currentSummary,
      other: otherSummary,
      blockers: await this.blockers(current, other),
    };
  }

  async take(token: string): Promise<StoredMergeOffer | undefined> {
    return this.appCache.take<StoredMergeOffer>(CacheKeys.mergeOffer(token));
  }

  async store(token: string, offer: StoredMergeOffer): Promise<void> {
    const remaining = new Date(offer.expiresAt).getTime() - Date.now();
    if (remaining <= 0) return;
    await this.appCache.set(CacheKeys.mergeOffer(token), offer, remaining);
  }

  async summarize(accountId: string): Promise<AccountSummary | null> {
    const account = await this.users.findAccountByProfileId(accountId);
    if (!account) return null;
    return {
      profileId: account.profileId,
      displayName: displayNameOrFallback(account.displayName),
      joined: account.joined.toISOString(),
      signInMethod: signInProvider(account.signIn),
      counts: await this.repository.counts(accountId),
    };
  }

  async blockers(first: string, second: string): Promise<string[]> {
    const [
      firstParticipant,
      secondParticipant,
      firstStaff,
      secondStaff,
      firstLive,
      secondLive,
      firstPlans,
      secondPlans,
    ] = await Promise.all([
      this.repository.participantTournaments(first),
      this.repository.participantTournaments(second),
      this.repository.staffTournaments(first),
      this.repository.staffTournaments(second),
      this.repository.liveDraftTournaments(first),
      this.repository.liveDraftTournaments(second),
      this.repository.planCounts(first),
      this.repository.planCounts(second),
    ]);
    const overfull = [...firstPlans].flatMap(([key, count]) => {
      const total = count + (secondPlans.get(key) ?? 0);
      return secondPlans.has(key) && total > MAX_PLANS ? [{ key, total }] : [];
    });
    const shared = (a: string[], b: string[]) => a.filter((id) => b.includes(id));
    const bothParticipate = shared(firstParticipant, secondParticipant);
    const bothStaff = shared(firstStaff, secondStaff);
    const live = [...new Set([...firstLive, ...secondLive])];

    const names = await this.repository.tournamentNames([
      ...new Set([...bothParticipate, ...bothStaff, ...live]),
    ]);
    return [
      ...bothParticipate.map(
        (id) => `Both accounts are in ${bothNamed(names, id)}.`,
      ),
      ...bothStaff.map(
        (id) => `Both accounts hold a staff seat in ${bothNamed(names, id)}.`,
      ),
      ...live.map(
        (id) =>
          `A draft is running in ${bothNamed(names, id)} and one of these accounts is coaching in it.`,
      ),
      ...overfull.map(
        ({ key, total }) =>
          `Together these accounts have ${total} plans in ${plannerName(key)}, and a planner holds ${MAX_PLANS}. Delete ${total - MAX_PLANS} first.`,
      ),
    ];
  }
}
