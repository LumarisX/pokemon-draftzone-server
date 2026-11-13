import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import {
  calculateTeamStandings,
  PopulatedStageMatchup,
} from "@modules/stage/domain/standings";
import { StageDocument } from "@modules/stage/stage.schema";
import { PopulatedTeam } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";

export type SeasonRank = { rank: number; of: number };
export type SeasonRanks = Map<string, SeasonRank>;

type Side = "side1" | "side2";
const SIDES: readonly Side[] = ["side1", "side2"];
const MAX_CACHED_TOURNAMENTS = 500;

type SeasonMatchup = Awaited<
  ReturnType<LeagueMatchupRepository["findSeasonByStages"]>
>[number];

type StageFingerprint = { count: number; latest: Date | null };

function placeholderTeam(teamId: string): PopulatedTeam {
  return {
    _id: { toString: () => teamId },
    teamName: "",
    slug: "",
    primaryCoach: { name: "" },
  } as unknown as PopulatedTeam;
}

export function publicStageIds(tournament: HostedTournament): Types.ObjectId[] {
  return tournament.stages
    .filter((stage) => stage.public !== false)
    .map((stage) => stage._id);
}

export function seasonFingerprint(
  tournament: HostedTournament,
  stages: Map<string, StageFingerprint>,
): string {
  return JSON.stringify({
    diffMode: tournament.diffMode,
    forfeit: tournament.forfeit ?? null,
    rules: tournament.standingsRules ?? null,
    rounds: (tournament.rounds ?? []).map((round) => round._id.toString()),
    stages: publicStageIds(tournament).map((stageId) => {
      const stage = stages.get(stageId.toString());
      return [
        stageId.toString(),
        stage?.count ?? 0,
        stage?.latest ? stage.latest.getTime() : 0,
      ];
    }),
  });
}

@Injectable()
export class SeasonRanksService {
  private readonly cache = new Map<
    string,
    { fingerprint: string; ranks: SeasonRanks }
  >();

  constructor(private readonly matchupRepo: LeagueMatchupRepository) {}

  async ranks(
    tournaments: HostedTournament[],
  ): Promise<Map<string, SeasonRanks>> {
    const unique = [
      ...new Map(
        tournaments.map((tournament) => [tournament.id, tournament]),
      ).values(),
    ];
    const result = new Map<string, SeasonRanks>();
    if (unique.length === 0) return result;

    const fingerprints = await this.matchupRepo.fingerprintsByStages(
      unique.flatMap(publicStageIds),
    );
    const byStage = new Map(
      fingerprints.map((row) => [
        row.stageId,
        { count: row.count, latest: row.latest },
      ]),
    );

    const stale: { tournament: HostedTournament; fingerprint: string }[] = [];
    for (const tournament of unique) {
      const fingerprint = seasonFingerprint(tournament, byStage);
      const cached = this.cache.get(tournament.id);
      if (cached?.fingerprint === fingerprint)
        result.set(tournament.id, cached.ranks);
      else stale.push({ tournament, fingerprint });
    }
    if (stale.length === 0) return result;

    const matchups = await this.matchupRepo.findSeasonByStages(
      stale.flatMap(({ tournament }) => publicStageIds(tournament)),
    );
    const tournamentByStage = new Map<string, string>();
    for (const { tournament } of stale)
      for (const stageId of publicStageIds(tournament))
        tournamentByStage.set(stageId.toString(), tournament.id);
    const byTournament = new Map<string, SeasonMatchup[]>();
    for (const matchup of matchups) {
      const tournamentId = tournamentByStage.get(matchup.stage?.toString() ?? "");
      if (!tournamentId) continue;
      const bucket = byTournament.get(tournamentId);
      if (bucket) bucket.push(matchup);
      else byTournament.set(tournamentId, [matchup]);
    }

    for (const { tournament, fingerprint } of stale) {
      const ranks = await this.compute(
        tournament,
        byTournament.get(tournament.id) ?? [],
      );
      this.remember(tournament.id, fingerprint, ranks);
      result.set(tournament.id, ranks);
    }
    return result;
  }

  private remember(
    tournamentId: string,
    fingerprint: string,
    ranks: SeasonRanks,
  ): void {
    this.cache.delete(tournamentId);
    this.cache.set(tournamentId, { fingerprint, ranks });
    if (this.cache.size <= MAX_CACHED_TOURNAMENTS) return;
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) this.cache.delete(oldest);
  }

  private async compute(
    tournament: HostedTournament,
    matchups: SeasonMatchup[],
  ): Promise<SeasonRanks> {
    if (!matchups.some((matchup) => matchup.winner)) return new Map();
    const teams = new Map<string, PopulatedTeam>();
    const teamFor = (matchup: SeasonMatchup, side: Side) => {
      const teamId = matchup[side].team?.toString();
      if (!teamId) return undefined;
      const team = teams.get(teamId) ?? placeholderTeam(teamId);
      teams.set(teamId, team);
      return team;
    };
    const views = matchups.map((matchup) => ({
      round: matchup.round,
      winner: matchup.winner,
      forfeit: matchup.forfeit,
      results: matchup.results,
      side1: { team: teamFor(matchup, SIDES[0]), score: matchup.side1.score },
      side2: { team: teamFor(matchup, SIDES[1]), score: matchup.side2.score },
    }));
    const { teamStandings } = await calculateTeamStandings(
      views as unknown as PopulatedStageMatchup[],
      { teams: [...teams.values()] } as unknown as StageDocument & {
        teams: PopulatedTeam[];
      },
      tournament,
    );
    return new Map(
      teamStandings.map((row, index) => [
        row.id,
        { rank: index + 1, of: teamStandings.length },
      ]),
    );
  }
}
