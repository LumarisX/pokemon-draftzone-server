import { ID } from "@pkmn/data";
import LeagueCoachModel, {
  LeagueCoachDocument,
} from "../../models/league/coach.model";
import LeagueDivisionModel, {
  DraftTrade,
  LeagueDivisionDocument,
} from "../../models/league/division.model";
import LeagueModel from "../../models/league/league.model";
import { LeagueDocument } from "../../models/league/league.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  TeamDraft,
} from "../../models/league/team.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";
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

  if (coachIds.length === 0) return [];

  const teams = await LeagueTeamModel.find({ coach: { $in: coachIds } });
  const teamIds = teams.map((team) => team._id);

  if (teamIds.length === 0) return [];

  const divisions = await LeagueDivisionModel.find({
    teams: { $in: teamIds },
    public: true,
  })
    .sort({ createdAt: -1 })
    .populate<{
      tournament: LeagueTournamentDocument & {
        league: LeagueDocument;
        tierList: LeagueTierListDocument;
      };
    }>({
      path: "tournament",
      populate: [
        {
          path: "league",
          model: LeagueModel,
        },
        {
          path: "tierList",
        },
      ],
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
          divisionKey: division.divisionKey,
          format: division.tournament.format,
          ruleset: division.tournament.ruleset,
          draft: userTeam.draft.map((e) => ({
            id: e.pokemon.id,
          })),
          score: {
            wins: 0,
            loses: 0,
            diff: 0,
          },
        });
      }
    }
  }

  return Array.from(tournamentMap.values());
}

export function getTeamClient(
  team: LeagueTeamDocument & { coach: LeagueCoachDocument },
) {
  return {
    id: team._id,
    name: team.coach.teamName,
    coach: team.coach.name,
    logo: team.coach.logo,
  };
}

export function getRosterByStage(
  team: LeagueTeamDocument,
  division: LeagueDivisionDocument,
  stage?: number,
) {
  const currentStage = division.currentStage;
  const stageTrades = division.trades
    .filter(
      (t) =>
        t.side1.team?._id.toString() === team._id.toString() ||
        t.side2.team?._id.toString() === team._id.toString(),
    )
    .reduce((map, t) => {
      const existing = map.get(t.activeStage);
      map.set(t.activeStage, existing ? [...existing, t] : [t]);
      return map;
    }, new Map<number, DraftTrade[]>());
  let roster: {
    id: string;
    addons?: string[];
  }[] = team.draft.map((p) => ({
    id: p.pokemon.id,
    addons: p.addons,
  }));
  for (let s = 0; s < (stage ?? currentStage); s++) {
    const trades = stageTrades.get(s) || [];
    for (let trade of trades) {
      const side =
        trade.side1.team?._id.toString() === team._id.toString()
          ? trade.side1
          : trade.side2;
      const otherSide =
        trade.side1.team?._id.toString() === team._id.toString()
          ? trade.side2
          : trade.side1;
      roster = roster.filter((pokemon) =>
        side.pokemon.some((p) => p.id === pokemon.id),
      );
      roster = [...roster, ...otherSide.pokemon];
    }
  }
  return roster;
}
