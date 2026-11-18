import { CoachModule } from "@modules/coach/coach.module";
import { DraftCoreModule } from "@modules/draft/draft-core.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { HostingAccessModule } from "@modules/tournament/sub-modules/hosted-tournament/hosting-access.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { UploadsModule } from "@modules/upload/upload.module";
import { UserModule } from "@modules/user/user.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StageCoreModule } from "@modules/stage/stage-core.module";
import { HallOfFameController } from "./hall-of-fame.controller";
import { HallOfFameService } from "./hall-of-fame.service";
import { LeagueService } from "./league.service";
import { MySeasonsService } from "./my-seasons.service";
import { SeasonRanksService } from "./season-ranks.service";
import { LeagueController } from "./league.controller";
import { LeagueCoreModule } from "./league-core.module";
import { LeagueAdminController } from "./league-admin.controller";
import { LeagueAdminService } from "./league-admin.service";
import { LeagueAdminInviteRepository } from "./league-admin-invite.repository";
import {
  LeagueAdminInviteEntity,
  LeagueAdminInviteSchema,
} from "./league-admin-invite.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeagueAdminInviteEntity.name, schema: LeagueAdminInviteSchema },
    ]),
    LeagueCoreModule,
    HostedTournamentCoreModule,
    TierListModule,
    CoachModule,
    TeamModule,
    DraftCoreModule,
    LeagueMatchupModule,
    HostingAccessModule,
    UploadsModule,
    StageCoreModule,
    UserModule,
  ],
  controllers: [LeagueController, LeagueAdminController, HallOfFameController],
  providers: [
    LeagueService,
    MySeasonsService,
    SeasonRanksService,
    LeagueAdminService,
    LeagueAdminInviteRepository,
    HallOfFameService,
  ],
  exports: [LeagueService, MySeasonsService, LeagueCoreModule],
})
export class LeagueModule {}
