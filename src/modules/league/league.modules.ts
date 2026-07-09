import { CoachModule } from "@modules/coach/coach.module";
import { DraftCoreModule } from "@modules/draft/draft-core.module";
import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { Module } from "@nestjs/common";
import { LeagueService } from "./league.service";
import { LeagueController } from "./league.controller";
import { LeagueCoreModule } from "./league-core.module";

@Module({
  imports: [
    LeagueCoreModule,
    HostedTournamentCoreModule,
    TierListModule,
    CoachModule,
    TeamModule,
    DraftCoreModule,
  ],
  controllers: [LeagueController],
  providers: [LeagueService],
  exports: [LeagueService, LeagueCoreModule],
})
export class LeagueModule {}
