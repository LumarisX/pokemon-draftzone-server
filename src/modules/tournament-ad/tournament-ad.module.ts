import { Module } from "@nestjs/common";
import { ExternalTournamentAdModule } from "./sub-modules/external-tournament-ad/external-tournament-ad.module";
import { HostedTournamentAdModule } from "./sub-modules/hosted-tournament-ad/hosted-tournament-ad.module";

@Module({
  imports: [ExternalTournamentAdModule, HostedTournamentAdModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class TournamentAdModule {}
