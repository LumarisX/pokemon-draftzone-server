import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StageController } from "./stage.controller";
import { StageEntity, StageSchema } from "./stage.schema";
import { StageRepository } from "./stage.repository";
import { StageService } from "./stage.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StageEntity.name, schema: StageSchema },
    ]),
    TeamModule,
    LeagueMatchupModule,
  ],
  controllers: [StageController],
  providers: [StageService, StageRepository],
  exports: [StageRepository],
})
export class StageModule {}
