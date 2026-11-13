import { ArchiveRepository } from "@modules/archive/archive.repository";
import { LeagueService } from "@modules/league/league.service";
import { MySeasonsService } from "@modules/league/my-seasons.service";
import { ExternalTournamentRepository } from "@modules/tournament/sub-modules/external-tournament/external-tournament.repository";
import { Injectable } from "@nestjs/common";
import {
  externalTeam,
  hostedTeam,
  orderTeams,
  upNextFrom,
} from "./dashboard.domain";

@Injectable()
export class DashboardService {
  constructor(
    private readonly seasons: MySeasonsService,
    private readonly leagues: LeagueService,
    private readonly externalRepo: ExternalTournamentRepository,
    private readonly archiveRepo: ArchiveRepository,
  ) {}

  async getDashboard(sub: string) {
    const [hosted, external, externalCompleted, legacyCompleted, owned] =
      await Promise.all([
        this.seasons.hosted(sub, { includeCompleted: false }),
        this.externalRepo.findByOwner(sub),
        this.externalRepo.countCompletedByOwner(sub),
        this.archiveRepo.countByOwner(sub),
        this.leagues.getOwnedLeagues(sub),
      ]);

    const teams = orderTeams([
      ...hosted.tournaments.map(hostedTeam),
      ...external.map(externalTeam),
    ]);

    return {
      teams,
      upNext: upNextFrom(teams),
      organizing: hosted.organizing.filter(
        (tournament) => tournament.phase !== "completed",
      ),
      leagues: owned.leagues,
      completedCount:
        hosted.completedCount + externalCompleted + legacyCompleted,
    };
  }
}
