import { TeamDocument, TeamEntity } from "@modules/team/team.schema";
import mongoose, { Types } from "mongoose";
import LeagueTournamentModel, {
  LeagueTournamentDocument,
} from "../../models/league/tournament.model";

/**
 * Deliberately dependency-free (no Nest module/DI, raw model access only) so
 * it can be imported by both team and coach modules without creating a
 * circular Nest module dependency with the hosted-tournament module, which
 * already imports both of those.
 */
export function isOrganizerOrOwner(
  tournament: { owner: string; organizers: string[] },
  sub: string | undefined,
): boolean {
  if (!sub) return false;
  return tournament.owner === sub || tournament.organizers.includes(sub);
}

export async function findTournamentById(
  tournamentId: Types.ObjectId | string,
): Promise<LeagueTournamentDocument | null> {
  return LeagueTournamentModel.findById(tournamentId);
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
): Promise<LeagueTournamentDocument | null> {
  const teamModel = mongoose.model<TeamDocument>(TeamEntity.name);
  const team = await teamModel.findById(teamId).select("tournamentId").exec();
  if (!team) return null;
  return findTournamentById(team.tournamentId);
}
