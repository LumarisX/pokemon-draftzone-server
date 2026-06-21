import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeamModule } from "@modules/team/team.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DraftController } from "./draft.controller";
import { DraftEntity, DraftSchema } from "./draft.schema";
import { DraftRepository } from "./draft.repository";
import { DraftService } from "./draft.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DraftEntity.name, schema: DraftSchema },
    ]),
    TeamModule,
    StageModule,
    LeagueMatchupModule,
  ],
  controllers: [DraftController],
  providers: [DraftService, DraftRepository],
  exports: [DraftRepository],
})
export class DraftModule {}
