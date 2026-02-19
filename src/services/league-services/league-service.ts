import {
  LEAGUE_DIVISION_COLLECTION,
  LEAGUE_TEAM_COLLECTION,
  LEAGUE_TOURNAMENT_COLLECTION,
} from "../../models/league";
import LeagueCoachModel from "../../models/league/coach.model";
import LeagueDivisionModel from "../../models/league/division.model";
import LeagueModel, { LeagueDocument } from "../../models/league/league.model";
import LeagueTeamModel from "../../models/league/team.model";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";

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
  const coaches = await LeagueCoachModel.find({ auth0Id });
  const coachIds = coaches.map((coach) => coach._id);

  if (coachIds.length === 0) {
    return [];
  }

  const teams = await LeagueTeamModel.find({ coach: { $in: coachIds } });
  const teamIds = teams.map((team) => team._id);

  if (teamIds.length === 0) {
    return [];
  }

  const divisions = await LeagueDivisionModel.find({
    teams: { $in: teamIds },
    public: true,
  })
    .sort({ createdAt: -1 })
    .populate<{
      tournament: LeagueTournamentDocument & { league: LeagueDocument };
    }>({
      path: "tournament",
      model: LEAGUE_TOURNAMENT_COLLECTION,
      populate: {
        path: "league",
        model: LeagueModel,
      },
    });

  const tournamentMap = new Map();

  for (const division of divisions) {
    const userTeam = teams.find((team) =>
      division.teams.some(
        (divTeam) => divTeam.toString() === team._id.toString(),
      ),
    );

    if (userTeam) {
      const coach = coaches.find(
        (c) => c._id.toString() === userTeam.coach.toString(),
      );

      if (coach && !tournamentMap.has(division.tournament._id.toString())) {
        tournamentMap.set(division.tournament._id.toString(), {
          name: coach.name,
          teamName: coach.teamName,
          tournamentName: division.tournament.name,
          logo: division.tournament.logo,
          discord: division.tournament.discord,
          tournamentKey: division.tournament.tournamentKey,
          leagueName: division.tournament.league.name,
          leagueKey: division.tournament.league.leagueKey,
          draft: userTeam.draft.map((e) => ({
            id: e.id,
          })),
        });
      }
    }
  }

  return Array.from(tournamentMap.values());
}
