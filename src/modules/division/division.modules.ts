import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DivisionController } from "./division.controller";
import { DivisionEntity, DivisionSchema } from "./division.schema";
import { DivisionRepository } from "./division.repository";
import { DivisionService } from "./division.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DivisionEntity.name, schema: DivisionSchema },
    ]),
    TeamModule,
    LeagueMatchupModule,
  ],
  controllers: [DivisionController],
  providers: [DivisionService, DivisionRepository],
  exports: [DivisionRepository],
})
export class DivisionModule {}
