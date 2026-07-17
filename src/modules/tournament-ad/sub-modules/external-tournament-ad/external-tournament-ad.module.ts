import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DiscordModule } from "@modules/discord/discord.module";
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
    DiscordModule,
  ],
  controllers: [ExternalTournamentAdController],
  providers: [ExternalTournamentAdService, ExternalTournamentAdRepository],
  exports: [ExternalTournamentAdRepository],
})
export class ExternalTournamentAdModule {}
