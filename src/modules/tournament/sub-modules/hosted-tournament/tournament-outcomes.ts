import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { toAdvancementMatchup } from "@modules/stage/bracket-advancement.service";
import { computeOutcomes, TeamOutcome } from "@modules/stage/domain/outcomes";
import {
  calculateTeamStandings,
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
};

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

  return {
    outcomes: computeOutcomes({
      standingsOrder: teamStandings.map((row) => row.id),
      bracketMatchups: bracketDocs.map(toAdvancementMatchup),
    }),
    teams,
    standings: teamStandings,
    bracketMatchups: bracketDocs.length,
  };
}
