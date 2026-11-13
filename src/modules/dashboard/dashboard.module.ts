import { ArchiveModule } from "@modules/archive/archive.module";
import { LeagueModule } from "@modules/league/league.modules";
import { ExternalTournamentModule } from "@modules/tournament/sub-modules/external-tournament/external-tournament.module";
import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [LeagueModule, ExternalTournamentModule, ArchiveModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
