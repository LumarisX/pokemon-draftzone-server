import { CoachRepository } from "@modules/coach/coach.repository";
import { getName } from "@modules/data/domain/pokedex";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { getLatestRoster } from "@modules/stage/domain/roster";
import {
  calculateTeamScore,
  PopulatedStageMatchup,
} from "@modules/stage/domain/standings";
import { rosterContextForTournament } from "@modules/stage/domain/stage-axis";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable } from "@nestjs/common";
import { LeagueRepository } from "./league.repository";

/**
 * When this team next plays. The card shows a countdown, and the record query
 * has already loaded every one of the team's matchups, so this costs no extra
 * round trip. Matchups with a result recorded are skipped: a score entered
 * late would otherwise keep the card pointing at a match already played.
 */
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

    // One query for every card's matches rather than one per card: a team only
    // ever appears in its own tournament's stages, so the results can be
    // bucketed by team afterwards without any risk of crossing tournaments.
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

    // Every matchup has one of these teams on it, but the other side is an
    // opponent whose record no card here shows, so only ours get a bucket.
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

    const details = await Promise.all(
      tournaments.map(async (tournament) => {
        const team = teamsByTournament.get(tournament.id);
        if (!team) return null;
        const [league, tierList] = await Promise.all([
          this.leagueRepo.findById(tournament.leagueId),
          this.tierListRepo.findById(tournament.tierListId),
        ]);
        // The tournament card is a "what do I have now" view, so it takes the
        // roster with every approved trade applied, including ones that land in
        // a round the season has not reached.
        const context = rosterContextForTournament(tournament);
        const roster = getLatestRoster(team, context).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          draftFormes: tierList.getPokemonFormes(pokemon.id),
        }));
        // Across every stage the team plays in, matching the team page: a
        // coach's record covers the group phase and the playoffs together.
        const teamMatchups = matchupsByTeam.get(team._id.toString()) ?? [];
        const record = teamMatchups.length
          ? await calculateTeamScore(
              teamMatchups as unknown as PopulatedStageMatchup[],
              context?.rounds ?? [],
              team,
              tournament.forfeit,
            )
          : undefined;
        return {
          name: tournament.name,
          teamName: team.teamName,
          tournamentName: tournament.name,
          logo: team.logo ?? tournament.logo,
          discord: tournament.discord,
          tournamentSlug: tournament.slug,
          leagueName: league.name,
          leagueSlug: league.slug,
          draftSlug: team.draftId
            ? draftSlugsById.get(team.draftId.toString())
            : undefined,
          teamId: team._id.toString(),
          teamSlug: team.slug,
          nextMatch: nextScheduledMatch(teamMatchups),
          draft: roster,
          format: tournament.format.name,
          ruleset: tournament.ruleset.name,
          // Undefined until the schedule exists, so the card shows no record
          // badge rather than a meaningless 0 - 0.
          score: record && {
            wins: record.wins,
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

    const tournamentSummaries = await Promise.all(
      tournaments.map(async (tournament) => {
        const tierList = await this.tierListRepo.findById(
          tournament.tierListId,
        );
        return {
          name: tournament.name,
          tournamentSlug: tournament.slug,
          description: tournament.description,
          format: tierList.format.name,
          ruleset: tierList.ruleset.name,
          signUpDeadline: tournament.signUpDeadline,
          draftStart: tournament.draftStart,
          draftEnd: tournament.draftEnd,
          seasonStart: tournament.seasonStart,
          seasonEnd: tournament.seasonEnd,
          logo: tournament.logo,
          discord: tournament.discord,
        };
      }),
    );

    return {
      name: league.name,
      leagueSlug: league.slug,
      description: league.description,
      logo: league.logo,
      tournaments: tournamentSummaries,
    };
  }
}
