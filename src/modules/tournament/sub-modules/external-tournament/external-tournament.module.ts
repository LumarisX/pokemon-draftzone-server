import { PokemonModule } from "@modules/pokemon/pokemon.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ExternalMatchupController } from "./external-matchup/external-matchup.controller";
import { ExternalMatchupRepository } from "./external-matchup/external-matchup.repository";
import {
  ExternalMatchupEntity,
  ExternalMatchupSchema,
} from "./external-matchup/external-matchup.schema";
import { ExternalMatchupService } from "./external-matchup/external-matchup.service";
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
      { name: ExternalMatchupEntity.name, schema: ExternalMatchupSchema },
    ]),
    PokemonModule,
  ],
  controllers: [ExternalTournamentController, ExternalMatchupController],
  providers: [
    ExternalTournamentService,
    ExternalTournamentRepository,
    ExternalMatchupService,
    ExternalMatchupRepository,
  ],
  exports: [ExternalTournamentRepository, ExternalMatchupRepository],
})
export class ExternalTournamentModule {}
