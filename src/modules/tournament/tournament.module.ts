import { MatchupController } from "@modules/tournament/matchup/matchup.controller";
import { Matchup } from "@modules/tournament/matchup/matchup.domain";
import { MatchupRepository } from "@modules/tournament/matchup/matchup.repository";
import { MatchupService } from "@modules/tournament/matchup/matchup.service";
import { PokemonModule } from "@modules/pokemon/pokemon.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DraftSchema } from "../../models/draft/draft.model";
import { MatchupSchema } from "../../models/draft/matchup.model";
import { TournamentController } from "./tournament.controller";
import { Tournament } from "./tournament.domain";
import { TournamentRepository } from "./tournament.repository";
import { TournamentService } from "./tournament.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tournament.name, schema: DraftSchema },
      { name: Matchup.name, schema: MatchupSchema },
    ]),
    PokemonModule,
  ],
  controllers: [TournamentController, MatchupController],
  providers: [
    TournamentService,
    TournamentRepository,
    MatchupService,
    MatchupRepository,
  ],
  exports: [TournamentRepository],
})
export class TournamentModule {}
