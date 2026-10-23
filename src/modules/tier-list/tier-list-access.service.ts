import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { can } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { TierList, TierListAccess } from "./tier-list.domain";
import { TierListRepository } from "./tier-list.repository";

export type ResolvedTierList = {
  tierList: TierList;
  access: TierListAccess;
  tournament: HostedTournament | null;
};

const RANK: Record<TierListAccess, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

@Injectable()
export class TierListAccessService {
  constructor(
    private readonly tierListRepo: TierListRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
  ) {}

  async resolve(
    idOrSlug: string,
    sub: string | undefined,
    needed: TierListAccess = "view",
  ): Promise<ResolvedTierList> {
    const tierList = await this.tierListRepo.findById(idOrSlug);
    const resolved = await this.accessTo(tierList, sub);
    if (resolved.access === "none")
      throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    if (RANK[resolved.access] < RANK[needed])
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);
    return resolved;
  }

  async accessTo(
    tierList: TierList,
    sub: string | undefined,
  ): Promise<ResolvedTierList> {
    if (!tierList.tournamentId)
      return { tierList, access: tierList.presetAccess(sub), tournament: null };

    const tournament = await this.tournamentRepo
      .findById(tierList.tournamentId)
      .catch(() => null);
    if (!tournament) return { tierList, access: "view", tournament: null };

    const organizer = can(tournament, sub, "manageSettings");
    const writable = organizer && !tierList.retiredAt && !tournament.completed;
    return {
      tierList,
      access: writable ? "edit" : "view",
      tournament,
    };
  }

  actorName(resolved: ResolvedTierList, sub: string): string | undefined {
    if (resolved.tournament)
      return resolved.tournament.staffName(sub) ?? undefined;
    if (resolved.tierList.createdBy === sub)
      return resolved.tierList.authorName;
    return resolved.tierList.members.find((member) => member.sub === sub)?.name;
  }
}

export function atLeast(access: TierListAccess, needed: TierListAccess): boolean {
  return RANK[access] >= RANK[needed];
}
