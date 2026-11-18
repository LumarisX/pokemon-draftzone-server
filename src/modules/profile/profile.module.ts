import { ArchiveModule } from "@modules/archive/archive.module";
import { LeagueModule } from "@modules/league/league.modules";
import { ExternalTournamentModule } from "@modules/tournament/sub-modules/external-tournament/external-tournament.module";
import { UserModule } from "@modules/user/user.module";
import { Module } from "@nestjs/common";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";
import { PublicProfileController } from "./public-profile.controller";

@Module({
  imports: [LeagueModule, ExternalTournamentModule, ArchiveModule, UserModule],
  controllers: [ProfileController, PublicProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
