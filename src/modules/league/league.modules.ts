import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { Module } from "@nestjs/common";
import { LeagueService } from "./league.service";
import { LeagueController } from "./league.controller";
import { LeagueCoreModule } from "./league-core.module";

@Module({
  imports: [LeagueCoreModule, HostedTournamentCoreModule, TierListModule],
  controllers: [LeagueController],
  providers: [LeagueService],
  exports: [LeagueService, LeagueCoreModule],
})
export class LeagueModule {}
