import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  LeagueMatchupEntity,
  LeagueMatchupSchema,
} from "./league-matchup.schema";
import { LeagueMatchupRepository } from "./league-matchup.repository";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeagueMatchupEntity.name, schema: LeagueMatchupSchema },
    ]),
  ],
  providers: [LeagueMatchupRepository],
  exports: [LeagueMatchupRepository],
})
export class LeagueMatchupModule {}
