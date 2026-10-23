import {
  HostedTournamentEntity,
  HostedTournamentSchema,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TournamentLogRepository } from "./tournament-log.repository";
import {
  TournamentLogEntity,
  TournamentLogSchema,
} from "./tournament-log.schema";
import { TournamentLogWriter } from "./tournament-log.writer";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TournamentLogEntity.name, schema: TournamentLogSchema },
      { name: HostedTournamentEntity.name, schema: HostedTournamentSchema },
    ]),
  ],
  providers: [TournamentLogRepository, TournamentLogWriter],
  exports: [TournamentLogRepository, TournamentLogWriter],
})
export class TournamentLogCoreModule {}
