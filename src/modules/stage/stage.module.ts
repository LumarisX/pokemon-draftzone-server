import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { StageController } from "./stage.controller";
import { StageRepository } from "./stage.repository";
import { StageEntity, StageSchema } from "./stage.schema";
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
    MongooseModule.forFeature([
      { name: StageEntity.name, schema: StageSchema },
    ]),
    TeamModule,
    LeagueMatchupModule,
    TierListModule,
    forwardRef(() => HostedTournamentCoreModule),
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
    StageRepository,
    TournamentBracketService,
    TournamentTradeService,
    TournamentScheduleService,
  ],
  exports: [StageRepository],
})
export class StageModule {}
