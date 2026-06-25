import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StageController } from "./stage.controller";
import { StageRepository } from "./stage.repository";
import { StageEntity, StageSchema } from "./stage.schema";
import { StageService } from "./stage.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StageEntity.name, schema: StageSchema },
    ]),
    TeamModule,
    LeagueMatchupModule,
    forwardRef(() => HostedTournamentCoreModule),
  ],
  controllers: [StageController],
  providers: [StageService, StageRepository],
  exports: [StageRepository],
})
export class StageModule {}
