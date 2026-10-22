import {
  EarnedAchievement,
  TeamSeason,
  evaluateAchievements,
} from "@modules/achievement/domain/achievement";
import { ACHIEVEMENTS } from "@modules/achievement/domain/catalog";
import {
  buildTeamSeasons,
  SeasonMatchup,
  SeasonTrade,
} from "@modules/achievement/domain/team-season";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { toAdvancementMatchup } from "@modules/stage/bracket-advancement.service";
import { computeOutcomes, TeamOutcome } from "@modules/stage/domain/outcomes";
import {
  calculatePokemonStandings,
  calculateTeamStandings,
  PokemonStanding,
  PopulatedStageMatchup,
  StandingsRow,
} from "@modules/stage/domain/standings";
import { StageRepository } from "@modules/stage/stage.repository";
import { StageDocument } from "@modules/stage/stage.schema";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "./hosted-tournament.domain";

export type OutcomeRepositories = {
  stageRepo: StageRepository;
  teamRepo: TeamRepository;
  matchupRepo: LeagueMatchupRepository;
};

export type TournamentOutcomes = {
  achievements: Map<string, EarnedAchievement[]>;
  seasons: Map<string, TeamSeason>;
  outcomes: Map<string, TeamOutcome>;
  teams: Map<string, PopulatedTeam>;
  standings: StandingsRow[];
  bracketMatchups: number;
  results: FinalResult[];
  unplayed: number;
  pendingReports: number;
};

export type SeasonMvp = { id: string; name: string; kills: number };

export type FinalResult = TeamOutcome & {
  achievements: EarnedAchievement[];
  teamId: string;
  teamSlug: string;
  name: string;
  logo: string | null;
  coach: string;
  wins: number;
  losses: number;
  draws: number;
  mvp: SeasonMvp | null;
  top: SeasonMvp[];
};

export const SEASON_LEADERS = 3;

export function seasonLeaders(
  pokemon: PokemonStanding[],
  limit = SEASON_LEADERS,
): Map<string, SeasonMvp[]> {
  const byTeam = new Map<string, PokemonStanding[]>();
  for (const entry of pokemon) {
    if (entry.record.kills <= 0) continue;
    byTeam.set(entry.teamId, [...(byTeam.get(entry.teamId) ?? []), entry]);
  }
  return new Map(
    [...byTeam].map(([teamId, entries]) => [
      teamId,
      entries
        .sort(
          (a, b) =>
            b.record.kills - a.record.kills ||
            a.record.deaths - b.record.deaths ||
            a.record.brought - b.record.brought,
        )
        .slice(0, limit)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          kills: entry.record.kills,
        })),
    ]),
  );
}

export function finalResults(
  outcomes: Map<string, TeamOutcome>,
  standings: StandingsRow[],
  leaders: Map<string, SeasonMvp[]>,
  achievements: Map<string, EarnedAchievement[]> = new Map(),
): FinalResult[] {
  const rows = new Map(standings.map((row) => [row.id, row]));
  return [...outcomes]
    .flatMap(([teamId, outcome]) => {
      const row = rows.get(teamId);
      if (!row) return [];
      return [
        {
          ...outcome,
          teamId,
          teamSlug: row.teamSlug,
          name: row.name,
          logo: row.logo ?? null,
          coach: row.coach,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          mvp: leaders.get(teamId)?.[0] ?? null,
          top: leaders.get(teamId) ?? [],
          achievements: achievements.get(teamId) ?? [],
        },
      ];
    })
    .sort((a, b) => a.placement - b.placement);
}

export async function computeTournamentOutcomes(
  { stageRepo, teamRepo, matchupRepo }: OutcomeRepositories,
  tournament: HostedTournament,
  options: { final?: boolean } = {},
): Promise<TournamentOutcomes> {
  const stages = await stageRepo.findAllByTournament(tournament.id);
  const teams = new Map<string, PopulatedTeam>();
  for (const stage of stages)
    for (const team of await teamRepo.findManyByIds(
      stageRepo.teamIdsInSeedOrder(stage),
    ))
      teams.set(team._id.toString(), team);

  const matchups = (await matchupRepo.findByStages(
    stages.map((stage) => stage._id),
  )) as unknown as PopulatedStageMatchup[];
  const { teamStandings } = await calculateTeamStandings(
    matchups,
    { teams: [...teams.values()] } as unknown as StageDocument & {
      teams: PopulatedTeam[];
    },
    tournament,
  );

  const eliminationStageIds = stages
    .filter((stage) => stage.type.endsWith("-elimination"))
    .map((stage) => stage._id);
  const bracketDocs =
    await matchupRepo.findAdvancementFieldsByStages(eliminationStageIds);

  const outcomes = computeOutcomes({
    standingsOrder: teamStandings.map((row) => row.id),
    bracketMatchups: bracketDocs.map(toAdvancementMatchup),
  });
  const leaders = seasonLeaders(await calculatePokemonStandings(matchups));
  const paired = matchups.filter(
    (matchup) => matchup.side1?.team && matchup.side2?.team,
  );

  const crowned = [...outcomes].find(([, outcome]) => outcome.champion)?.[0];
  const championDecided = !!tournament.completedAt || options.final === true;
  const seasons = buildTeamSeasons({
    teamIds: [...teams.keys()],
    matchups: matchups as unknown as SeasonMatchup[],
    trades: (tournament.trades ?? []) as unknown as SeasonTrade[],
    championId: championDecided ? (crowned ?? null) : null,
  });
  const achievements = new Map(
    [...seasons].map(([teamId, season]) => [
      teamId,
      evaluateAchievements(ACHIEVEMENTS, season),
    ]),
  );

  return {
    achievements,
    seasons,
    outcomes,
    teams,
    standings: teamStandings,
    bracketMatchups: bracketDocs.length,
    results: finalResults(outcomes, teamStandings, leaders, achievements),
    unplayed: paired.filter((matchup) => !matchup.winner).length,
    pendingReports: paired.filter(
      (matchup) => matchup.report && matchup.status !== "approved",
    ).length,
  };
}
