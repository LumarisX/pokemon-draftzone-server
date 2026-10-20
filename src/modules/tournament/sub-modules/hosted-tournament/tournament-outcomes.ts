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
  teamId: string;
  teamSlug: string;
  name: string;
  logo: string | null;
  coach: string;
  wins: number;
  losses: number;
  draws: number;
  mvp: SeasonMvp | null;
};

export function seasonMvps(
  pokemon: PokemonStanding[],
): Map<string, SeasonMvp> {
  const best = new Map<string, PokemonStanding>();
  for (const entry of pokemon) {
    if (entry.record.kills <= 0) continue;
    const current = best.get(entry.teamId);
    const better =
      !current ||
      entry.record.kills > current.record.kills ||
      (entry.record.kills === current.record.kills &&
        (entry.record.deaths < current.record.deaths ||
          (entry.record.deaths === current.record.deaths &&
            entry.record.brought < current.record.brought)));
    if (better) best.set(entry.teamId, entry);
  }
  return new Map(
    [...best].map(([teamId, entry]) => [
      teamId,
      { id: entry.id, name: entry.name, kills: entry.record.kills },
    ]),
  );
}

export function finalResults(
  outcomes: Map<string, TeamOutcome>,
  standings: StandingsRow[],
  mvps: Map<string, SeasonMvp>,
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
          mvp: mvps.get(teamId) ?? null,
        },
      ];
    })
    .sort((a, b) => a.placement - b.placement);
}

export async function computeTournamentOutcomes(
  { stageRepo, teamRepo, matchupRepo }: OutcomeRepositories,
  tournament: HostedTournament,
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
  const mvps = seasonMvps(await calculatePokemonStandings(matchups));
  const paired = matchups.filter(
    (matchup) => matchup.side1?.team && matchup.side2?.team,
  );

  return {
    outcomes,
    teams,
    standings: teamStandings,
    bracketMatchups: bracketDocs.length,
    results: finalResults(outcomes, teamStandings, mvps),
    unplayed: paired.filter((matchup) => !matchup.winner).length,
    pendingReports: paired.filter(
      (matchup) => matchup.report && matchup.status !== "approved",
    ).length,
  };
}
