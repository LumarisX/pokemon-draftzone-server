import { PokemonModule } from "@modules/pokemon/pokemon.module";
import { ExternalTournamentModule } from "@modules/tournament/sub-modules/external-tournament/external-tournament.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  ExternalTournamentEntity,
  ExternalTournamentSchema,
} from "../../../tournament/sub-modules/external-tournament/external-tournament.schema";
import { ExternalMatchupBreakdownController } from "./external-matchup-breakdown/external-matchup-breakdown.controller";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown/external-matchup-breakdown.service";
import { ExternalMatchupController } from "./external-matchup.controller";
import { ExternalMatchupRepository } from "./external-matchup.repository";
import {
  ExternalMatchupEntity,
  ExternalMatchupSchema,
} from "./external-matchup.schema";
import { ExternalMatchupService } from "./external-matchup.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExternalTournamentEntity.name, schema: ExternalTournamentSchema },
      { name: ExternalMatchupEntity.name, schema: ExternalMatchupSchema },
    ]),
    ExternalTournamentModule,
    PokemonModule,
  ],
  controllers: [ExternalMatchupController, ExternalMatchupBreakdownController],
  providers: [
    ExternalMatchupService,
    ExternalMatchupRepository,
    ExternalMatchupBreakdownService,
  ],
  exports: [ExternalMatchupRepository],
})
export class ExternalMatchupModule {}
