import { CoachRepository } from "@modules/coach/coach.repository";
import { getName } from "@modules/data/domain/pokedex";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { getLatestRoster } from "@modules/stage/domain/roster";
import {
  calculateCurrentPick,
  getCurrentPickingTeam,
  isPreDraftStatus,
} from "@modules/draft/domain/pick-order";
import { DraftDocument } from "@modules/draft/draft.schema";
import {
  calculateTeamScore,
  calculateTeamStandings,
  PopulatedStageMatchup,
} from "@modules/stage/domain/standings";
import { rosterContext } from "@modules/stage/domain/stage-axis";
import { StageDocument } from "@modules/stage/stage.schema";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import {
  EntryMatchup,
  formFrom,
  NextMatch,
  nextMatchFor,
} from "./my-league-entry";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { HostingAccessService } from "@modules/tournament/sub-modules/hosted-tournament/hosting-access.service";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { UploadFolder } from "@modules/upload/upload-folder.enum";
import { UploadsService } from "@modules/upload/upload.service";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { CreateLeagueDto, UpdateLeagueDto } from "./league.dto";
import { adminName, leagueRole } from "./league-access";
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
    private readonly hosting: HostingAccessService,
    private readonly uploads: UploadsService,
  ) {}

  async getLeagues(sub: string) {
    const [tournaments, coaches, staffed] = await Promise.all([
      this.hostedTournamentRepo.findByParticipant(sub),
      this.coachRepo.findByAuth0Id(sub),
      this.hostedTournamentRepo.findByStaff(sub),
    ]);
    const participating = new Set(tournaments.map((tournament) => tournament.id));
    const organizing = await this.organizingView(
      staffed.filter((tournament) => !participating.has(tournament.id)),
      sub,
    );
    if (tournaments.length === 0) return { tournaments: [], organizing };

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
    const draftsById = new Map(
      drafts.map((draft) => [draft._id.toString(), draft]),
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
        const seatCompletedAt =
          coaches.find((coach) => coach.teamId.equals(team._id))
            ?.completedAt ?? null;
        const pool = team.draftId
          ? draftsById.get(team.draftId.toString())
          : undefined;
        const season = await this.seasonView(tournament, team, pool);
        const completedAt = tournament.completedAt ?? seatCompletedAt;
        return {
          phase: completedAt
            ? "completed"
            : season.draft && !isPreDraftStatus(season.draft.status) &&
                season.draft.status !== "COMPLETED"
              ? "drafting"
              : !pool || isPreDraftStatus(pool.status)
                ? "upcoming"
                : "season",
          completedAt,
          completedByOrganizer: !!tournament.completedAt,
          startsAt: tournament.draftStart ?? null,
          form: formFrom(record?.results ?? []),
          next: completedAt ? null : season.next,
          standing: season.standing,
          draftState: season.draft,
          outcome: team.outcome
            ? {
                placement: team.outcome.placement,
                of: team.outcome.of,
                label: team.outcome.label ?? null,
                champion: team.outcome.champion,
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
      organizing,
    };
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
    return tournaments.map((tournament) => {
      const statuses = statusesByTournament.get(tournament.id) ?? [];
      return {
        tournamentName: tournament.name,
        tournamentSlug: tournament.slug,
        leagueName: tournament.leagueName,
        leagueSlug: tournament.leagueSlug,
        logo: tournament.logo,
        owner: tournament.owner === sub,
        phase: tournament.completedAt
          ? "completed"
          : statuses.some(
                (status) => status === "IN_PROGRESS" || status === "PAUSED",
              )
            ? "drafting"
            : statuses.every((status) => isPreDraftStatus(status))
              ? "upcoming"
              : "season",
        startsAt: tournament.draftStart ?? null,
        completedAt: tournament.completedAt ?? null,
      };
    });
  }

  private async seasonView(
    tournament: HostedTournament,
    team: PopulatedTeam,
    pool: DraftDocument | undefined,
  ): Promise<{
    next: NextMatch | null;
    standing: { rank: number; of: number } | null;
    draft: {
      status: string;
      picksMade: number;
      rosterSize: number | null;
      onClock: boolean;
      round: number | null;
      pick: number | null;
      deadline: string | null;
    } | null;
  }> {
    const teamId = team._id.toString();
    const draft = pool ? await this.draftState(pool, team, tournament) : null;

    const stageIds = tournament.stages
      .filter((stage) => stage.public !== false)
      .map((stage) => stage._id);
    const matchups = (await this.matchupRepo.findByStages(
      stageIds,
    )) as unknown as PopulatedStageMatchup[];
    if (matchups.length === 0) return { next: null, standing: null, draft };

    const next = nextMatchFor(
      matchups as unknown as EntryMatchup[],
      teamId,
      tournament.rounds,
    );

    let standing: { rank: number; of: number } | null = null;
    if (matchups.some((matchup) => matchup.winner)) {
      const teams = new Map<string, PopulatedTeam>();
      for (const matchup of matchups)
        for (const side of ["side1", "side2"] as const) {
          const sideTeam = matchup[side].team as PopulatedTeam | undefined;
          if (sideTeam?._id) teams.set(sideTeam._id.toString(), sideTeam);
        }
      const { teamStandings } = await calculateTeamStandings(
        matchups,
        {
          teams: [...teams.values()],
        } as unknown as StageDocument & { teams: PopulatedTeam[] },
        tournament,
      );
      const rank = teamStandings.findIndex((row) => row.id === teamId);
      if (rank >= 0) standing = { rank: rank + 1, of: teamStandings.length };
    }
    return { next, standing, draft };
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
    const picking = populated ? getCurrentPickingTeam(populated) : null;
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

  async getHallOfFame(leagueSlug: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const completed = (
      await this.hostedTournamentRepo.findAllByLeague(league)
    ).filter((tournament) => !!tournament.completedAt);

    const seasons = await Promise.all(
      completed.map(async (tournament) => {
        const teams = await this.teamRepo.findAllByTournament(tournament.id);
        const placed = teams
          .filter((team) => team.outcome && team.outcome.placement <= 3)
          .sort((a, b) => a.outcome!.placement - b.outcome!.placement);
        return {
          tournamentSlug: tournament.slug,
          name: tournament.name,
          logo: tournament.logo ?? null,
          format: tournament.format?.name ?? null,
          ruleset: tournament.ruleset?.name ?? null,
          completedAt: tournament.completedAt!,
          teamCount: teams.find((team) => team.outcome)?.outcome?.of ?? 0,
          places: placed.map((team) => ({
            teamSlug: team.slug,
            name: team.teamName,
            logo: team.logo ?? null,
            coach: team.primaryCoach?.name ?? null,
            placement: team.outcome!.placement,
            label: team.outcome!.label ?? null,
            champion: team.outcome!.champion,
            wins: team.outcome!.wins ?? null,
            losses: team.outcome!.losses ?? null,
            draws: team.outcome!.draws ?? null,
            mvp: team.outcome!.mvp
              ? {
                  id: team.outcome!.mvp.id,
                  name: team.outcome!.mvp.name,
                  kills: team.outcome!.mvp.kills,
                }
              : null,
          })),
        };
      }),
    );

    return {
      name: league.name,
      leagueSlug: league.slug,
      logo: league.logo ?? null,
      seasons: seasons
        .filter((season) => season.places.length > 0)
        .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()),
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
      completedAt: tournament.completedAt ?? null,
    }));

    const role = leagueRole(league, sub);
    const isOwner = role === "owner";
    const latest = tournaments.at(-1);
    const hosting = isOwner && sub ? await this.hosting.access(sub) : null;

    return {
      name: league.name,
      leagueSlug: league.slug,
      description: league.description,
      logo: league.logo,
      tournaments: tournamentSummaries,
      isOwner,
      role,
      newTournamentDefaults: role
        ? {
            ownerName: isOwner
              ? latest?.ownerName?.sub === league.owner
                ? latest.ownerName.name
                : null
              : adminName(league, sub!),
            copyFrom: latest
              ? { tournamentSlug: latest.slug, name: latest.name }
              : null,
            tierLists: tournaments
              .filter((tournament) => tournament.hasTierList)
              .reverse()
              .map((tournament) => ({
                tournamentSlug: tournament.slug,
                name: tournament.name,
                format: tournament.format?.name ?? null,
                ruleset: tournament.ruleset?.name ?? null,
              })),
          }
        : null,
      hosting: hosting
        ? {
            canHost: hosting.canHost,
            canCreateTournament: hosting.tournament.allowed,
            reason: hosting.tournament.allowed
              ? null
              : hosting.tournament.reason,
          }
        : role === "admin"
          ? { canHost: true, canCreateTournament: true, reason: null }
          : null,
    };
  }

  async getCapabilities(sub: string) {
    const canHost = await this.hosting.canHost(sub);
    return {
      canCreateLeague: canHost,
      reason: canHost ? null : ("restricted" as const),
    };
  }

  async createLeague(sub: string, dto: CreateLeagueDto) {
    await this.hosting.assertCanCreateLeague(sub);

    const league = await this.leagueRepo.create({
      name: dto.name,
      description: dto.description || undefined,
      owner: sub,
    });
    return { leagueSlug: league.slug };
  }

  async getOwnedLeagues(sub: string) {
    const leagues = await this.leagueRepo.findManagedBy(sub);
    const ownsAny = leagues.some((league) => league.owner === sub);
    const access = ownsAny ? await this.hosting.access(sub) : null;
    return {
      leagues: leagues.map((league) => {
        const role = leagueRole(league, sub);
        return {
          name: league.name,
          leagueSlug: league.slug,
          logo: league.logo,
          role,
          canCreateTournament:
            role === "admin" || (access?.tournament.allowed ?? false),
        };
      }),
    };
  }

  async updateLeague(leagueSlug: string, sub: string, dto: UpdateLeagueDto) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    if (!leagueRole(league, sub))
      throw new PDZError(ErrorCodes.LEAGUE.NOT_ADMIN, { leagueSlug });

    if (dto.logo && dto.logo !== league.logo)
      await this.uploads.claimUpload(dto.logo, {
        uploadedBy: sub,
        folder: UploadFolder.LEAGUE_LOGOS,
        relatedEntityId: league._id.toString(),
      });

    const changes = {
      name: dto.name,
      description:
        dto.description === undefined ? undefined : dto.description || null,
      logo: dto.logo,
    };
    if (Object.values(changes).some((value) => value !== undefined))
      await this.leagueRepo.update(league._id, changes);

    return { message: "League updated" };
  }
}
