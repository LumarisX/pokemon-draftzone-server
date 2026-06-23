import { CoachModule } from "@modules/coach/coach.module";
import { DiscordModule } from "@modules/discord/discord.module";
import { DraftModule } from "@modules/draft/draft.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeamModule } from "@modules/team/team.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HostedTournamentController } from "./hosted-tournament.controller";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  HostedTournamentEntity,
  HostedTournamentSchema,
} from "./hosted-tournament.schema";
import { HostedTournamentService } from "./hosted-tournament.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HostedTournamentEntity.name, schema: HostedTournamentSchema },
    ]),
    TierListModule,
    TeamModule,
    CoachModule,
    DiscordModule,
    DraftModule,
    StageModule,
    LeagueMatchupModule,
  ],
  controllers: [HostedTournamentController],
  providers: [HostedTournamentService, HostedTournamentRepository],
  exports: [HostedTournamentRepository],
})
export class HostedTournamentModule {}
