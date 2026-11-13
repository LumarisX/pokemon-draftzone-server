import { ArchiveModule } from "@modules/archive/archive.module";
import { LeagueModule } from "@modules/league/league.modules";
import { ExternalTournamentModule } from "@modules/tournament/sub-modules/external-tournament/external-tournament.module";
import { Module } from "@nestjs/common";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [LeagueModule, ExternalTournamentModule, ArchiveModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
