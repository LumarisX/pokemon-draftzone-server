import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ExternalTournamentAdController } from "./external-tournament-ad.controller";
import {
  ExternalTournamentAdEntity,
  ExternalTournamentAdSchema,
} from "./external-tournament-ad.schema";
import { ExternalTournamentAdService } from "./external-tournament-ad.service";
import { ExternalTournamentAdRepository } from "./external-tournament-ad.repository";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ExternalTournamentAdEntity.name,
        schema: ExternalTournamentAdSchema,
      },
    ]),
  ],
  controllers: [ExternalTournamentAdController],
  providers: [ExternalTournamentAdService, ExternalTournamentAdRepository],
  exports: [ExternalTournamentAdRepository],
})
export class ExternalTournamentAdModule {}
