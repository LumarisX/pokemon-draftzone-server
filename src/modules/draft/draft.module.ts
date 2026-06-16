import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Draft } from "../../classes/draft";
import { Matchup } from "../../classes/matchup";
import { DraftSchema } from "../../models/draft/draft.model";
import { DraftController } from "./draft.controller";
import { DraftService } from "./draft.service";
import { MatchupService } from "./matchup.service";
import { PokedexService } from "./pokedex.service";
import { MatchupSchema } from "../../models/draft/matchup.model";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Draft.name, schema: DraftSchema },
      { name: Matchup.name, schema: MatchupSchema },
    ]),
  ],
  controllers: [DraftController],
  providers: [DraftService, PokedexService, MatchupService],
})
export class DraftModule {}
