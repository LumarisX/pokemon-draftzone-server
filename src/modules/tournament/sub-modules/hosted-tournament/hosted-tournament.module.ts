import { CoachModule } from "@modules/coach/coach.module";
import { DiscordModule } from "@modules/discord/discord.module";
import { DraftCoreModule } from "@modules/draft/draft-core.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeamModule } from "@modules/team/team.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { TournamentApplicationModule } from "@modules/tournament-application/tournament-application.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HostedTournamentCoreModule } from "./hosted-tournament-core.module";
import { HostedTournamentController } from "./hosted-tournament.controller";
import { HostedTournamentService } from "./hosted-tournament.service";
import { OrganizerInviteRepository } from "./organizer-invite.repository";
import {
  OrganizerInviteEntity,
  OrganizerInviteSchema,
} from "./organizer-invite.schema";
import { TournamentOrganizerController } from "./tournament-organizer.controller";
import { TournamentOrganizerService } from "./tournament-organizer.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizerInviteEntity.name, schema: OrganizerInviteSchema },
    ]),
    HostedTournamentCoreModule,
    TournamentApplicationModule,
    TierListModule,
    TeamModule,
    CoachModule,
    DiscordModule,
    DraftCoreModule,
    StageModule,
    LeagueMatchupModule,
  ],
  controllers: [HostedTournamentController, TournamentOrganizerController],
  providers: [
    HostedTournamentService,
    TournamentOrganizerService,
    OrganizerInviteRepository,
  ],
  exports: [HostedTournamentCoreModule],
})
export class HostedTournamentModule {}
