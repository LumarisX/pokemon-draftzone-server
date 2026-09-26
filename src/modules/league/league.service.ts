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
import { UserService } from "@modules/user/user.service";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  decideLeagueCreation,
  leagueCreationMode,
  maxOwnedLeagues,
} from "./league-creation";
import { CreateLeagueDto } from "./league.dto";
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
    private readonly userService: UserService,
    private readonly config: ConfigService,
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
    const poolSlugsById = new Map(
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
          poolSlug: team.draftId
            ? poolSlugsById.get(team.draftId.toString())
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

  async getLeagueSummary(leagueSlug: string, sub?: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const tournaments = await this.hostedTournamentRepo.findAllByLeague(league);

    const tournamentSummaries = tournaments.map((tournament) => ({
      name: tournament.name,
      tournamentSlug: tournament.slug,
      description: tournament.description,
      format: tournament.format?.name ?? null,
      ruleset: tournament.ruleset?.name ?? null,
      signUpDeadline: tournament.signUpDeadline,
      draftStart: tournament.draftStart,
      draftEnd: tournament.draftEnd,
      seasonStart: tournament.seasonStart,
      seasonEnd: tournament.seasonEnd,
      logo: tournament.logo,
      discord: tournament.discord,
    }));

    const isOwner = sub !== undefined && sub === league.owner;
    const latest = tournaments.at(-1);

    return {
      name: league.name,
      leagueSlug: league.slug,
      description: league.description,
      logo: league.logo,
      tournaments: tournamentSummaries,
      isOwner,
      newTournamentDefaults: isOwner
        ? {
            ownerName:
              latest?.owner === sub && latest.ownerName?.sub === sub
                ? latest.ownerName.name
                : null,
            copyFrom: latest
              ? { tournamentSlug: latest.slug, name: latest.name }
              : null,
          }
        : null,
    };
  }

  async getCapabilities(sub: string) {
    const decision = await this.decideLeagueCreation(sub);
    return {
      canCreateLeague: decision.allowed,
      reason: decision.allowed ? null : decision.reason,
    };
  }

  async createLeague(sub: string, dto: CreateLeagueDto) {
    const decision = await this.decideLeagueCreation(sub);
    if (!decision.allowed)
      throw new PDZError(
        decision.reason === "limit"
          ? ErrorCodes.LEAGUE.OWNED_LIMIT
          : ErrorCodes.LEAGUE.CREATION_RESTRICTED,
      );

    const league = await this.leagueRepo.create({
      name: dto.name,
      description: dto.description || undefined,
      owner: sub,
    });
    return { leagueSlug: league.slug };
  }

  async getOwnedLeagues(sub: string) {
    const leagues = await this.leagueRepo.findByOwner(sub);
    return {
      leagues: leagues.map((league) => ({
        name: league.name,
        leagueSlug: league.slug,
        logo: league.logo,
      })),
    };
  }

  private async decideLeagueCreation(sub: string) {
    const [user, ownedCount] = await Promise.all([
      this.userService.getMe(sub),
      this.leagueRepo.countByOwner(sub),
    ]);
    return decideLeagueCreation({
      mode: leagueCreationMode(this.config.get<string>("LEAGUE_CREATION")),
      roles: user.roles ?? [],
      ownedCount,
      maxOwned: maxOwnedLeagues(this.config.get<string>("MAX_OWNED_LEAGUES")),
    });
  }
}
