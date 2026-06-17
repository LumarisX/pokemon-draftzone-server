import { Module } from "@nestjs/common";
import { ExternalTournamentModule } from "./sub-modules/external-tournament/external-tournament.module";
import { HostedTournamentModule } from "./sub-modules/hosted-tournament/hosted-tournament.module";

@Module({
  imports: [ExternalTournamentModule, HostedTournamentModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class TournamentModule {}
