import { HostedTournamentModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { Module } from "@nestjs/common";
import { LeagueService } from "./league.service";
import { LeagueRepository } from "./league.repository";
import { LeagueController } from "./league.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { LeagueEntity, LeagueSchema } from "./league.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeagueEntity.name, schema: LeagueSchema },
    ]),
    HostedTournamentModule,
    TierListModule,
  ],
  controllers: [LeagueController],
  providers: [LeagueService, LeagueRepository],
  exports: [LeagueService, LeagueRepository],
})
export class LeagueModule {}
