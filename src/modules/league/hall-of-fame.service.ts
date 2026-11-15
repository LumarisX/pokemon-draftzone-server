import { achievementCatalog } from "@modules/achievement/domain/catalog";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { computeTournamentOutcomes } from "@modules/tournament/sub-modules/hosted-tournament/tournament-outcomes";
import { Injectable } from "@nestjs/common";
import { LeagueRepository } from "./league.repository";
import { publicStageIds, seasonFingerprint } from "./season-ranks.service";

type TeamCard = {
  teamSlug: string;
  name: string;
  logo: string | null;
  coach: string | null;
};

type StoredAchievement = {
  id: string;
  rarity: string;
  tier: number;
  count: number;
  earnedAt?: Date | null;
};

type EarnedEntry = {
  achievementId: string;
  rarity: string;
  tier: number;
  count: number;
  earnedAt: Date | null;
  tournamentSlug: string;
  tournamentName: string;
  completed: boolean;
  team: TeamCard;
};

type StageFingerprints = Map<string, { count: number; latest: Date | null }>;

const MAX_CACHED_TOURNAMENTS = 200;

export function achievementsFingerprint(
  tournament: HostedTournament,
  stages: StageFingerprints,
): string {
  return JSON.stringify({
    season: seasonFingerprint(tournament, stages),
    completedAt: tournament.completedAt
      ? new Date(tournament.completedAt).getTime()
      : null,
    trades: (tournament.trades ?? []).map((trade) => [
      trade._id?.toString() ?? null,
      trade.status ?? null,
    ]),
    stages: tournament.stages
      .filter((stage) => stage.public !== false)
      .map((stage) => [
        stage._id.toString(),
        stage.type,
        (stage.teamIds ?? []).map(String),
      ]),
  });
}

function teamCard(team: PopulatedTeam): TeamCard {
  return {
    teamSlug: team.slug,
    name: team.teamName,
    logo: team.logo ?? null,
    coach: team.primaryCoach?.name ?? null,
  };
}

@Injectable()
export class HallOfFameService {
  private readonly liveAchievements = new Map<
    string,
    { fingerprint: string; achievements: Map<string, StoredAchievement[]> }
  >();

  constructor(
    private readonly leagueRepo: LeagueRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly teamRepo: TeamRepository,
    private readonly stageRepo: StageRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
  ) {}

  async getHallOfFame(leagueSlug: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const tournaments = await this.tournamentRepo.findAllByLeague(league);
    const stages: StageFingerprints = new Map(
      (
        await this.matchupRepo.fingerprintsByStages(
          tournaments.flatMap(publicStageIds),
        )
      ).map((row) => [row.stageId, { count: row.count, latest: row.latest }]),
    );

    const perTournament = await Promise.all(
      tournaments.map(async (tournament) => {
        const teams = await this.teamRepo.findAllByTournament(tournament.id);
        return {
          season: tournament.completedAt ? this.season(tournament, teams) : null,
          earned: await this.earned(tournament, teams, stages),
        };
      }),
    );

    return {
      name: league.name,
      leagueSlug: league.slug,
      logo: league.logo ?? null,
      seasons: perTournament
        .flatMap(({ season }) => (season?.places.length ? [season] : []))
        .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()),
      achievements: {
        catalog: achievementCatalog(),
        earned: perTournament.flatMap(({ earned }) => earned),
      },
    };
  }

  private season(tournament: HostedTournament, teams: PopulatedTeam[]) {
    const placed = teams
      .filter((team) => team.outcome)
      .sort((a, b) => a.outcome!.placement - b.outcome!.placement);
    return {
      tournamentSlug: tournament.slug,
      name: tournament.name,
      logo: tournament.logo ?? null,
      format: tournament.format?.name ?? null,
      ruleset: tournament.ruleset?.name ?? null,
      completedAt: tournament.completedAt!,
      teamCount: teams.find((team) => team.outcome)?.outcome?.of ?? 0,
      places: placed.map((team) => {
        const outcome = team.outcome!;
        const mvp = outcome.mvp
          ? { id: outcome.mvp.id, name: outcome.mvp.name, kills: outcome.mvp.kills }
          : null;
        return {
          ...teamCard(team),
          placement: outcome.placement,
          label: outcome.label ?? null,
          champion: outcome.champion,
          wins: outcome.wins ?? null,
          losses: outcome.losses ?? null,
          draws: outcome.draws ?? null,
          mvp,
          top: outcome.top?.length
            ? outcome.top.map((entry) => ({
                id: entry.id,
                name: entry.name,
                kills: entry.kills,
              }))
            : mvp
              ? [mvp]
              : [],
        };
      }),
    };
  }

  private async liveAchievementsFor(
    tournament: HostedTournament,
    stages: StageFingerprints,
  ): Promise<Map<string, StoredAchievement[]>> {
    const fingerprint = achievementsFingerprint(tournament, stages);
    const cached = this.liveAchievements.get(tournament.id);
    if (cached?.fingerprint === fingerprint) return cached.achievements;

    const { achievements } = await computeTournamentOutcomes(
      {
        stageRepo: this.stageRepo,
        teamRepo: this.teamRepo,
        matchupRepo: this.matchupRepo,
      },
      tournament,
      { publicOnly: true },
    );
    this.liveAchievements.delete(tournament.id);
    this.liveAchievements.set(tournament.id, { fingerprint, achievements });
    if (this.liveAchievements.size > MAX_CACHED_TOURNAMENTS) {
      const oldest = this.liveAchievements.keys().next().value;
      if (oldest !== undefined) this.liveAchievements.delete(oldest);
    }
    return achievements;
  }

  private async earned(
    tournament: HostedTournament,
    teams: PopulatedTeam[],
    stages: StageFingerprints,
  ): Promise<EarnedEntry[]> {
    const completed = !!tournament.completedAt;
    const snapshot = teams.some((team) => team.outcome?.achievements);
    const byId = new Map(teams.map((team) => [team._id.toString(), team]));

    let earnedByTeam: Map<string, StoredAchievement[]>;
    if (completed && snapshot) {
      earnedByTeam = new Map(
        teams.map((team) => [
          team._id.toString(),
          team.outcome?.achievements ?? [],
        ]),
      );
    } else {
      earnedByTeam = await this.liveAchievementsFor(tournament, stages);
    }

    return [...earnedByTeam].flatMap(([teamId, earned]) => {
      const team = byId.get(teamId);
      if (!team) return [];
      return earned.map((entry) => ({
        achievementId: entry.id,
        rarity: entry.rarity,
        tier: entry.tier,
        count: entry.count,
        earnedAt: entry.earnedAt ?? null,
        tournamentSlug: tournament.slug,
        tournamentName: tournament.name,
        completed,
        team: teamCard(team),
      }));
    });
  }
}
