import LeagueCoachModel from "../../models/league/coach.model";
import { LEAGUE_TOURNAMENT_COLLECTION } from "../../models/league";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";
import LeagueModel, { LeagueDocument } from "../../models/league/league.model";

export function getRoles(sub: string | undefined) {
  if (!sub) return [];
  const roles = [];
  if (
    sub === "google-oauth2|110216442143129521066" || //lumaris
    sub === "oauth2|discord|491431053471383575" || //twang
    sub === "oauth2|discord|533998216450932756" || //turtlecode
    sub === "oauth2|discord|422843761765122071" //ian
  ) {
    roles.push("organizer");
  }
  return roles;
}

export async function getTournamentsByOwner(auth0Id: string) {
  const tournamentDocs = (
    await LeagueCoachModel.find({ auth0Id, status: "approved" })
      .sort({
        createdAt: -1,
      })
      .populate<{
        tournamentId: LeagueTournamentDocument & { league: LeagueDocument };
      }>({
        path: "tournamentId",
        model: LEAGUE_TOURNAMENT_COLLECTION,
        populate: {
          path: "league",
          model: LeagueModel,
        },
      })
  ).map((doc) => ({
    name: doc.name,
    teamName: doc.teamName,
    tournamentName: doc.tournamentId.name,
    logo: doc.tournamentId.logo,
    discord: doc.tournamentId.discord,
    tournamentKey: doc.tournamentId.tournamentKey,
    leagueName: doc.tournamentId.league.name,
    leagueKey: doc.tournamentId.league.leagueKey,
  }));
  return tournamentDocs;
}
