import { LeagueDocument, LeagueEntity } from "@modules/league/league.schema";
import { TeamDocument, TeamEntity } from "@modules/team/team.schema";
import {
  HostedTournamentDocument,
  HostedTournamentEntity,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import mongoose, { Types } from "mongoose";

export type TournamentAccess = { owner: string; organizers: string[] };

export function isOrganizerOrOwner(
  tournament: TournamentAccess,
  sub: string | undefined,
): boolean {
  if (!sub) return false;
  return tournament.owner === sub || tournament.organizers.includes(sub);
}

/**
 * Deliberately dependency-free (no Nest module/DI, raw model access only) so
 * it can be imported by both team and coach modules without creating a
 * circular Nest module dependency with the hosted-tournament module, which
 * already imports both of those. Looks up models by name (registered by
 * their owning modules at bootstrap) rather than injecting their
 * repositories.
 */
export async function findTournamentById(
  tournamentId: Types.ObjectId | string,
): Promise<TournamentAccess | null> {
  const tournamentModel = mongoose.model<HostedTournamentDocument>(
    HostedTournamentEntity.name,
  );
  const tournament = await tournamentModel
    .findById(tournamentId)
    .select("organizers league")
    .exec();
  if (!tournament) return null;

  const leagueModel = mongoose.model<LeagueDocument>(LeagueEntity.name);
  const league = await leagueModel
    .findById(tournament.league)
    .select("owner")
    .exec();
  if (!league) return null;

  return { owner: league.owner, organizers: tournament.organizers };
}

/**
 * Resolves a team's tournament via its tournamentId field. Looks up the
 * TeamEntity model by name (registered by TeamModule at bootstrap) rather
 * than injecting TeamRepository, for the same dependency-free reason as
 * above — this also gets called from the coach module, which would
 * otherwise need a circular import on team.module.
 */
export async function findTournamentByTeamId(
  teamId: Types.ObjectId | string,
): Promise<TournamentAccess | null> {
  const teamModel = mongoose.model<TeamDocument>(TeamEntity.name);
  const team = await teamModel.findById(teamId).select("tournamentId").exec();
  if (!team) return null;
  return findTournamentById(team.tournamentId);
}
