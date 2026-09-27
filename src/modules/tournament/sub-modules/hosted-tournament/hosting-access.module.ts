import { LeagueCoreModule } from "@modules/league/league-core.module";
import { UserModule } from "@modules/user/user.module";
import { Module } from "@nestjs/common";
import { HostedTournamentCoreModule } from "./hosted-tournament-core.module";
import { HostingAccessService } from "./hosting-access.service";

@Module({
  imports: [HostedTournamentCoreModule, LeagueCoreModule, UserModule],
  providers: [HostingAccessService],
  exports: [HostingAccessService],
})
export class HostingAccessModule {}
