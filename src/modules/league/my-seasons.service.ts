import { CoachRepository } from "@modules/coach/coach.repository";
import { CoachDocument } from "@modules/coach/coach.schema";
import { getName } from "@modules/data/domain/pokedex";
import {
  calculateCurrentPick,
  getCurrentPickingTeam,
} from "@modules/draft/domain/pick-order";
import { DraftRepository } from "@modules/draft/draft.repository";
import { DraftDocument } from "@modules/draft/draft.schema";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { getLatestRoster } from "@modules/stage/domain/roster";
import { rosterContext } from "@modules/stage/domain/stage-axis";
import {
  calculateTeamScore,
  PopulatedStageMatchup,
} from "@modules/stage/domain/standings";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Injectable } from "@nestjs/common";
import {
  EntryMatchup,
  formFrom,
  NextMatch,
  nextMatchFor,
  seasonPhase,
} from "./my-league-entry";
import { publicStageIds, SeasonRanksService } from "./season-ranks.service";

type Side = "side1" | "side2";
const SIDES: readonly Side[] = ["side1", "side2"];

type ScoringMatchupDocument = Awaited<
  ReturnType<LeagueMatchupRepository["findScoringByStages"]>
>[number];

type Seat = {
  tournament: HostedTournament;
  team: PopulatedTeam;
  completedAt: Date | null;
};

function nextScheduledMatch(matchups: ScoringMatchupDocument[]): string | null {
  const now = Date.now();
  const upcoming = matchups
    .filter(
      (matchup) =>
        matchup.scheduledDate &&
        matchup.scheduledDate.getTime() > now &&
        !matchup.results?.length,
    )
    .sort((a, b) => a.scheduledDate!.getTime() - b.scheduledDate!.getTime());

  return upcoming[0]?.scheduledDate?.toISOString() ?? null;
}

function sideTeamId(
  matchup: ScoringMatchupDocument,
  side: Side,
): string | undefined {
  return matchup[side].team?.toString();
}

@Injectable()
export class MySeasonsService {
  constructor(
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
    private readonly draftRepo: DraftRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly seasonRanks: SeasonRanksService,
  ) {}

  async hosted(sub: string, options: { includeCompleted?: boolean } = {}) {
    const includeCompleted = options.includeCompleted !== false;
    const [coaches, staffed] = await Promise.all([
      this.coachRepo.findByAuth0Id(sub),
      this.hostedTournamentRepo.findByStaff(sub),
    ]);
    const allSeats = await this.seats(coaches);
    const participating = new Set(allSeats.map((seat) => seat.tournament.id));
    const organizing = await this.organizingView(
      staffed.filter((tournament) => !participating.has(tournament.id)),
      sub,
    );

    const completedCount = allSeats.filter((seat) => seat.completedAt).length;
    const seats = includeCompleted
      ? allSeats
      : allSeats.filter((seat) => !seat.completedAt);
    if (seats.length === 0)
      return { tournaments: [], organizing, completedCount };

    const liveSeats = seats.filter((seat) => !seat.completedAt);
    const rosters = new Map(
      seats.map((seat) => [
        seat.team._id.toString(),
        getLatestRoster(seat.team, rosterContext(seat.tournament)),
      ]),
    );
    const [pools, scoring, ranksByTournament, formesByList] = await Promise.all([
      this.draftRepo.findManyByIds(
        seats.flatMap((seat) => (seat.team.draftId ? [seat.team.draftId] : [])),
      ),
      this.matchupRepo.findScoringByStages(
        this.stageIds(seats),
        seats.map((seat) => seat.team._id),
      ),
      this.seasonRanks.ranks(liveSeats.map((seat) => seat.tournament)),
      this.tierListRepo.findRosterFormes(
        seats.map((seat) => ({
          tierListId: seat.tournament.tierListId,
          pokemonIds: (rosters.get(seat.team._id.toString()) ?? []).map(
            (pokemon) => pokemon.id,
          ),
        })),
      ),
    ]);
    const poolsById = new Map(pools.map((pool) => [pool._id.toString(), pool]));

    const ownTeamIds = new Set(seats.map((seat) => seat.team._id.toString()));
    const scoringByTeam = new Map<string, ScoringMatchupDocument[]>();
    for (const matchup of scoring) {
      for (const side of SIDES) {
        const teamId = sideTeamId(matchup, side);
        if (!teamId || !ownTeamIds.has(teamId)) continue;
        const bucket = scoringByTeam.get(teamId);
        if (bucket) bucket.push(matchup);
        else scoringByTeam.set(teamId, [matchup]);
      }
    }

    const nextByTeam = await this.nextMatches(liveSeats, scoringByTeam);

    const tournaments = await Promise.all(
      seats.map(async ({ tournament, team, completedAt }) => {
        const teamId = team._id.toString();
        const formes = formesByList.get(tournament.tierListId);
        const context = rosterContext(tournament);
        const roster = (rosters.get(teamId) ?? []).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          draftFormes: formes?.get(pokemon.id),
        }));
        const teamMatchups = scoringByTeam.get(teamId) ?? [];
        const record = teamMatchups.length
          ? await calculateTeamScore(
              teamMatchups as unknown as PopulatedStageMatchup[],
              context.rounds,
              team,
              tournament,
            )
          : undefined;
        const pool = team.draftId
          ? poolsById.get(team.draftId.toString())
          : undefined;
        const draftState = pool
          ? await this.draftState(pool, team, tournament)
          : null;
        return {
          phase: seasonPhase(completedAt, pool ? [pool.status] : []),
          completedAt,
          completedByOrganizer: !!tournament.completedAt,
          startsAt: tournament.draftStart ?? null,
          form: formFrom(record?.results ?? []),
          next: nextByTeam.get(teamId) ?? null,
          standing: completedAt
            ? null
            : (ranksByTournament.get(tournament.id)?.get(teamId) ?? null),
          draftState,
          outcome: team.outcome
            ? {
                placement: team.outcome.placement,
                of: team.outcome.of,
                label: team.outcome.label ?? null,
                champion: team.outcome.champion,
                achievements: (team.outcome.achievements ?? []).map(
                  (achievement) => ({
                    id: achievement.id,
                    rarity: achievement.rarity,
                  }),
                ),
              }
            : null,
          name: tournament.name,
          teamName: team.teamName,
          tournamentName: tournament.name,
          logo: team.logo ?? tournament.logo,
          discord: tournament.discord,
          tournamentSlug: tournament.slug,
          leagueName: tournament.leagueName,
          leagueSlug: tournament.leagueSlug,
          poolSlug: pool?.slug,
          teamId,
          teamSlug: team.slug,
          nextMatch: nextScheduledMatch(teamMatchups),
          draft: roster,
          format: tournament.format?.name ?? null,
          ruleset: tournament.ruleset?.name ?? null,
          score: record && {
            wins: record.wins,
            draws: record.draws,
            losses: record.losses,
            diff:
              tournament.diffMode === "game"
                ? record.gameDiff
                : record.pokemonDiff,
          },
        };
      }),
    );

    return { tournaments, organizing, completedCount };
  }

  private async seats(coaches: CoachDocument[]): Promise<Seat[]> {
    if (coaches.length === 0) return [];
    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    const tournaments = await this.hostedTournamentRepo.findManyByIds([
      ...new Set(teams.map((team) => team.tournamentId.toString())),
    ]);
    return tournaments.flatMap((tournament) =>
      teams
        .filter((team) => team.tournamentId.toString() === tournament.id)
        .map((team) => ({
          tournament,
          team,
          completedAt:
            tournament.completedAt ??
            coaches.find((coach) => coach.teamId.equals(team._id))
              ?.completedAt ??
            null,
        })),
    );
  }

  private stageIds(seats: Seat[]) {
    const tournaments = new Map(
      seats.map((seat) => [seat.tournament.id, seat.tournament]),
    );
    return [...tournaments.values()].flatMap((tournament) =>
      tournament.stages.map((stage) => stage._id),
    );
  }

  private async nextMatches(
    seats: Seat[],
    scoringByTeam: Map<string, ScoringMatchupDocument[]>,
  ): Promise<Map<string, NextMatch | null>> {
    const ownTeams = new Map(
      seats.map((seat) => [seat.team._id.toString(), seat.team]),
    );
    const open = seats.map((seat) => {
      const teamId = seat.team._id.toString();
      const stages = new Set(
        publicStageIds(seat.tournament).map((stageId) => stageId.toString()),
      );
      return {
        seat,
        teamId,
        matchups: (scoringByTeam.get(teamId) ?? []).filter(
          (matchup) =>
            !matchup.winner && stages.has(matchup.stage?.toString() ?? ""),
        ),
      };
    });

    const opponentIds = new Set<string>();
    for (const { matchups } of open)
      for (const matchup of matchups)
        for (const side of SIDES) {
          const teamId = sideTeamId(matchup, side);
          if (teamId && !ownTeams.has(teamId)) opponentIds.add(teamId);
        }
    const opponents = opponentIds.size
      ? await this.teamRepo.findManyByIds([...opponentIds])
      : [];
    const teams = new Map([
      ...ownTeams,
      ...opponents.map((team): [string, PopulatedTeam] => [
        team._id.toString(),
        team,
      ]),
    ]);
    const teamFor = (teamId: string | undefined) =>
      teamId ? teams.get(teamId) : undefined;

    return new Map(
      open.map(({ seat, teamId, matchups }) => [
        teamId,
        nextMatchFor(
          matchups.map(
            (matchup) =>
              ({
                slug: matchup.slug,
                round: matchup.round,
                winner: matchup.winner,
                scheduledDate: matchup.scheduledDate,
                side1: { team: teamFor(sideTeamId(matchup, "side1")) },
                side2: { team: teamFor(sideTeamId(matchup, "side2")) },
              }) as unknown as EntryMatchup,
          ),
          teamId,
          seat.tournament.rounds,
        ),
      ]),
    );
  }

  private async organizingView(tournaments: HostedTournament[], sub: string) {
    const pools = await this.draftRepo.findAllByTournaments(
      tournaments.map((tournament) => tournament.id),
    );
    const statusesByTournament = new Map<string, string[]>();
    for (const pool of pools) {
      const key = pool.tournamentId.toString();
      statusesByTournament.set(key, [
        ...(statusesByTournament.get(key) ?? []),
        pool.status,
      ]);
    }
    return tournaments.map((tournament) => ({
      tournamentName: tournament.name,
      tournamentSlug: tournament.slug,
      leagueName: tournament.leagueName,
      leagueSlug: tournament.leagueSlug,
      logo: tournament.logo,
      owner: tournament.owner === sub,
      phase: seasonPhase(
        tournament.completedAt,
        statusesByTournament.get(tournament.id) ?? [],
      ),
      startsAt: tournament.draftStart ?? null,
      completedAt: tournament.completedAt ?? null,
    }));
  }

  private async draftState(
    pool: DraftDocument,
    team: PopulatedTeam,
    tournament: HostedTournament,
  ) {
    const live = pool.status === "IN_PROGRESS";
    const populated =
      live && pool.sequentialTurns
        ? await this.draftRepo.findPopulatedById(pool._id)
        : null;
    const picking = populated
      ? getCurrentPickingTeam(populated, tournament.draftCount?.max ?? 0)
      : null;
    const current = populated ? calculateCurrentPick(populated) : null;
    return {
      status: pool.status,
      picksMade: team.pickLog?.length ?? 0,
      rosterSize: tournament.draftCount?.max ?? null,
      onClock: !!picking && picking._id.toString() === team._id.toString(),
      round: current ? current.round + 1 : null,
      pick: current ? current.position + 1 : null,
      deadline:
        live && pool.skipTime ? new Date(pool.skipTime).toISOString() : null,
    };
  }
}
