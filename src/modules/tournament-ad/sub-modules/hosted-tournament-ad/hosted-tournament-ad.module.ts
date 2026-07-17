import { LeagueCoreModule } from "@modules/league/league-core.module";
import {
  HostedTournamentEntity,
  HostedTournamentSchema,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HostedTournamentAdController } from "./hosted-tournament-ad.controller";
import { HostedTournamentAdService } from "./hosted-tournament-ad.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HostedTournamentEntity.name, schema: HostedTournamentSchema },
    ]),
    LeagueCoreModule,
  ],
  controllers: [HostedTournamentAdController],
  providers: [HostedTournamentAdService],
  exports: [],
})
export class HostedTournamentAdModule {}
