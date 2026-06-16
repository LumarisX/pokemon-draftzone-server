import { MatchupModule } from "@modules/matchup/matchup.module";
import { PokemonModule } from "@modules/pokemon/pokemon.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Draft } from "../../classes/draft";
import { DraftSchema } from "../../models/draft/draft.model";
import { TournamentController } from "./tournament.controller";
import { TournamentRepository } from "./tournament.repository";
import { TournamentService } from "./tournament.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Draft.name, schema: DraftSchema }]),
    PokemonModule,
    MatchupModule,
  ],
  controllers: [TournamentController],
  providers: [TournamentService, TournamentRepository],
})
export class TournamentModule {}
