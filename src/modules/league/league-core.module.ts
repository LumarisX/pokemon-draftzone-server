import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { LeagueEntity, LeagueSchema } from "./league.schema";
import { LeagueRepository } from "./league.repository";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeagueEntity.name, schema: LeagueSchema },
    ]),
  ],
  providers: [LeagueRepository],
  exports: [LeagueRepository],
})
export class LeagueCoreModule {}
