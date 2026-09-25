import { CoachRepository } from "@modules/coach/coach.repository";
import { getName } from "@modules/data/domain/pokedex";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { getLatestRoster } from "@modules/stage/domain/roster";
import {
  calculateTeamScore,
  PopulatedStageMatchup,
} from "@modules/stage/domain/standings";
import { rosterContext } from "@modules/stage/domain/stage-axis";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable } from "@nestjs/common";
import { LeagueRepository } from "./league.repository";

function nextScheduledMatch(
  matchups: { scheduledDate?: Date | null; results?: unknown[] }[],
): string | null {
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

@Injectable()
export class LeagueService {
  constructor(
    private readonly leagueRepo: LeagueRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
    private readonly draftRepo: DraftRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
  ) {}

  async getLeagues(sub: string) {
    const [tournaments, coaches] = await Promise.all([
      this.hostedTournamentRepo.findByParticipant(sub),
      this.coachRepo.findByAuth0Id(sub),
    ]);
    if (tournaments.length === 0) return { tournaments: [] };

    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    const teamsByTournament = new Map(
      teams.map((team) => [team.tournamentId.toString(), team]),
    );

    const [drafts, scoringMatchups] = await Promise.all([
      this.draftRepo.findManyByIds(
        teams.flatMap((team) => (team.draftId ? [team.draftId] : [])),
      ),
      this.matchupRepo.findScoringByStages(
        tournaments.flatMap((tournament) =>
          tournament.stages.map((stage) => stage._id),
        ),
        teams.map((team) => team._id),
      ),
    ]);
    const draftSlugsById = new Map(
      drafts.map((draft) => [draft._id.toString(), draft.slug]),
    );

    const ownTeamIds = new Set(teams.map((team) => team._id.toString()));
    const matchupsByTeam = new Map<string, typeof scoringMatchups>();
    for (const matchup of scoringMatchups) {
      for (const side of ["side1", "side2"] as const) {
        const teamId = matchup[side].team?.toString();
        if (!teamId || !ownTeamIds.has(teamId)) continue;
        const bucket = matchupsByTeam.get(teamId);
        if (bucket) bucket.push(matchup);
        else matchupsByTeam.set(teamId, [matchup]);
      }
    }

    const tierListsById = await this.tierListRepo.findManyByIds(
      tournaments.map((tournament) => tournament.tierListId),
    );

    const details = await Promise.all(
      tournaments.map(async (tournament) => {
        const team = teamsByTournament.get(tournament.id);
        if (!team) return null;
        const tierList = tierListsById.get(tournament.tierListId);
        const context = rosterContext(tournament);
        const roster = getLatestRoster(team, context).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          draftFormes: tierList?.getPokemonFormes(pokemon.id),
        }));
        const teamMatchups = matchupsByTeam.get(team._id.toString()) ?? [];
        const record = teamMatchups.length
          ? await calculateTeamScore(
              teamMatchups as unknown as PopulatedStageMatchup[],
              context.rounds,
              team,
              tournament,
            )
          : undefined;
        return {
          name: tournament.name,
          teamName: team.teamName,
          tournamentName: tournament.name,
          logo: team.logo ?? tournament.logo,
          discord: tournament.discord,
          tournamentSlug: tournament.slug,
          leagueName: tournament.leagueName,
          leagueSlug: tournament.leagueSlug,
          draftSlug: team.draftId
            ? draftSlugsById.get(team.draftId.toString())
            : undefined,
          teamId: team._id.toString(),
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

    return {
      tournaments: details.filter(
        (detail): detail is NonNullable<typeof detail> => detail !== null,
      ),
    };
  }

  async getLeagueSummary(leagueSlug: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const tournaments = await this.hostedTournamentRepo.findAllByLeague(league);

    const tournamentSummaries = tournaments.flatMap((tournament) => {
      const { format, ruleset } = tournament;
      if (!format || !ruleset) return [];
      return [
        {
          name: tournament.name,
          tournamentSlug: tournament.slug,
          description: tournament.description,
          format: format.name,
          ruleset: ruleset.name,
          signUpDeadline: tournament.signUpDeadline,
          draftStart: tournament.draftStart,
          draftEnd: tournament.draftEnd,
          seasonStart: tournament.seasonStart,
          seasonEnd: tournament.seasonEnd,
          logo: tournament.logo,
          discord: tournament.discord,
        },
      ];
    });

    return {
      name: league.name,
      leagueSlug: league.slug,
      description: league.description,
      logo: league.logo,
      tournaments: tournamentSummaries,
    };
  }
}
