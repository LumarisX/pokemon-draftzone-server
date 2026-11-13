import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { HostingAccessService } from "@modules/tournament/sub-modules/hosted-tournament/hosting-access.service";
import { UploadFolder } from "@modules/upload/upload-folder.enum";
import { UploadsService } from "@modules/upload/upload.service";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { CreateLeagueDto, UpdateLeagueDto } from "./league.dto";
import { DraftRepository } from "@modules/draft/draft.repository";
import { adminName, leagueRole } from "./league-access";
import {
  directoryStatus,
  leagueStatus,
  orderDirectory,
} from "./league-directory";
import { seasonPhase } from "./my-league-entry";
import { LeagueRepository } from "./league.repository";
import { MySeasonsService } from "./my-seasons.service";

@Injectable()
export class LeagueService {
  constructor(
    private readonly leagueRepo: LeagueRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly hosting: HostingAccessService,
    private readonly uploads: UploadsService,
    private readonly seasons: MySeasonsService,
    private readonly draftRepo: DraftRepository,
  ) {}

  async getLeagues(sub: string) {
    const { tournaments, organizing } = await this.seasons.hosted(sub);
    return { tournaments, organizing };
  }

  async getDirectory() {
    const leagues = await this.leagueRepo.findListed();
    const tournaments = await this.hostedTournamentRepo.findActiveInLeagues(
      leagues.map((league) => league._id),
    );
    const statusesByTournament = await this.poolStatuses(
      tournaments.map((tournament) => tournament.id),
    );

    return {
      leagues: orderDirectory(
        leagues.map((league) => {
          const current = tournaments
            .filter((tournament) => tournament.leagueSlug === league.slug)
            .map((tournament) => ({
              name: tournament.name,
              tournamentSlug: tournament.slug,
              format: tournament.format?.name ?? null,
              ruleset: tournament.ruleset?.name ?? null,
              status: directoryStatus(
                seasonPhase(
                  tournament.completedAt,
                  statusesByTournament.get(tournament.id) ?? [],
                ),
                tournament.signUpDeadline,
              ),
              signUpDeadline: tournament.signUpDeadline ?? null,
              draftStart: tournament.draftStart ?? null,
            }));
          return {
            name: league.name,
            leagueSlug: league.slug,
            description: league.description ?? null,
            logo: league.logo ?? null,
            status: leagueStatus(current),
            tournaments: current,
          };
        }),
      ),
    };
  }

  private async poolStatuses(
    tournamentIds: string[],
  ): Promise<Map<string, string[]>> {
    const pools = await this.draftRepo.findAllByTournaments(tournamentIds);
    const statuses = new Map<string, string[]>();
    for (const pool of pools) {
      const key = pool.tournamentId.toString();
      statuses.set(key, [...(statuses.get(key) ?? []), pool.status]);
    }
    return statuses;
  }

  async getLeagueSummary(leagueSlug: string, sub?: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const tournaments = await this.hostedTournamentRepo.findAllByLeague(league);

    const statuses = await this.poolStatuses(
      tournaments.map((tournament) => tournament.id),
    );
    const now = Date.now();

    const tournamentSummaries = tournaments.map((tournament) => {
      const phase = seasonPhase(
        tournament.completedAt,
        statuses.get(tournament.id) ?? [],
      );
      return {
        phase,
        signUpOpen:
          directoryStatus(phase, tournament.signUpDeadline, now) === "signups",
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
      };
    });

    const role = leagueRole(league, sub);
    const isOwner = role === "owner";
    const latest = tournaments.at(-1);
    const hosting = isOwner && sub ? await this.hosting.access(sub) : null;

    return {
      name: league.name,
      leagueSlug: league.slug,
      description: league.description,
      logo: league.logo,
      listed: league.listed === true,
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
      listed: dto.listed,
    };
    if (Object.values(changes).some((value) => value !== undefined))
      await this.leagueRepo.update(league._id, changes);

    return { message: "League updated" };
  }
}
