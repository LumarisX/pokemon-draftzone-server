import { Module } from "@nestjs/common";
import { MatchupService } from "./matchup.service";
import { MatchupController } from "./matchup.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { MatchupSchema } from "../../models/draft/matchup.model";
import { Matchup } from "../../classes/matchup";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Matchup.name, schema: MatchupSchema }]),
  ],
  controllers: [MatchupController],
  providers: [MatchupService],
  exports: [MatchupService],
})
export class MatchupModule {}
