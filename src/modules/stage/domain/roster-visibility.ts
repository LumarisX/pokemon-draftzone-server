import { canSeeTeamPicks } from "@modules/draft/domain/pick-visibility";
import { PopulatedTeam } from "@modules/team/team.repository";
import { TournamentStaff } from "@modules/tournament/tournament-policy";
import { Types } from "mongoose";

export type RosterVisibility = (team: PopulatedTeam) => boolean;

type PoolVisibility = {
  _id: Types.ObjectId;
  picksVisibleTo?: "everyone" | "ownTeam";
  status?: string;
};

export function rosterVisibilityFor(
  tournament: TournamentStaff,
  pools: readonly PoolVisibility[],
  sub: string | undefined,
): RosterVisibility {
  const byId = new Map(pools.map((pool) => [pool._id.toString(), pool]));
  return (team) => {
    if (!team.draftId) return true;
    const pool = byId.get(team.draftId.toString());
    if (!pool) return true;
    return canSeeTeamPicks(tournament, pool, team, sub);
  };
}
