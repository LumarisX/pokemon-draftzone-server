import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { Module } from "@nestjs/common";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { StageCoreModule } from "./stage-core.module";
import { StageController } from "./stage.controller";
import { StageService } from "./stage.service";
import { TournamentBracketController } from "./tournament-bracket.controller";
import { TournamentBracketService } from "./tournament-bracket.service";
import { TournamentMatchupController } from "./tournament-matchup.controller";
import { TournamentScheduleController } from "./tournament-schedule.controller";
import { TournamentScheduleService } from "./tournament-schedule.service";
import { TournamentTradeController } from "./tournament-trade.controller";
import { TournamentTradeService } from "./tournament-trade.service";

@Module({
  imports: [
    StageCoreModule,
    TeamModule,
    LeagueMatchupModule,
    TierListModule,
    HostedTournamentCoreModule,
  ],
  controllers: [
    StageController,
    TournamentMatchupController,
    TournamentBracketController,
    TournamentTradeController,
    TournamentScheduleController,
  ],
  providers: [
    StageService,
    BracketAdvancementService,
    TournamentBracketService,
    TournamentTradeService,
    TournamentScheduleService,
  ],
})
export class StageModule {}
