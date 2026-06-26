import { Module } from "@nestjs/common";
import { ExternalMatchupModule } from "./sub-modules/external-matchup/external-matchup.module";

@Module({
  imports: [ExternalMatchupModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class MatchupModule {}
