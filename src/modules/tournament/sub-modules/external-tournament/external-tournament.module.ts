import { PokemonModule } from "@modules/pokemon/pokemon.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ExternalTournamentController } from "./external-tournament.controller";
import { ExternalTournamentRepository } from "./external-tournament.repository";
import {
  ExternalTournamentEntity,
  ExternalTournamentSchema,
} from "./external-tournament.schema";
import { ExternalTournamentService } from "./external-tournament.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExternalTournamentEntity.name, schema: ExternalTournamentSchema },
    ]),
    PokemonModule,
  ],
  controllers: [ExternalTournamentController],
  providers: [ExternalTournamentService, ExternalTournamentRepository],
  exports: [ExternalTournamentRepository],
})
export class ExternalTournamentModule {}
