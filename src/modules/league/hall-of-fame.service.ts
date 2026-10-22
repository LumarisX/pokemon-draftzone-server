import { achievementCatalog } from "@modules/achievement/domain/catalog";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { computeTournamentOutcomes } from "@modules/tournament/sub-modules/hosted-tournament/tournament-outcomes";
import { Injectable } from "@nestjs/common";
import { LeagueRepository } from "./league.repository";

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

    const perTournament = await Promise.all(
      tournaments.map(async (tournament) => {
        const teams = await this.teamRepo.findAllByTournament(tournament.id);
        return {
          season: tournament.completedAt ? this.season(tournament, teams) : null,
          earned: await this.earned(tournament, teams),
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

  private async earned(
    tournament: HostedTournament,
    teams: PopulatedTeam[],
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
      const { achievements } = await computeTournamentOutcomes(
        {
          stageRepo: this.stageRepo,
          teamRepo: this.teamRepo,
          matchupRepo: this.matchupRepo,
        },
        tournament,
      );
      earnedByTeam = achievements;
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
