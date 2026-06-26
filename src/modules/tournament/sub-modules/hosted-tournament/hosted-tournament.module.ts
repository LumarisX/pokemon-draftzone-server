import { CoachModule } from "@modules/coach/coach.module";
import { DiscordModule } from "@modules/discord/discord.module";
import { DraftCoreModule } from "@modules/draft/draft-core.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeamModule } from "@modules/team/team.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { Module } from "@nestjs/common";
import { HostedTournamentCoreModule } from "./hosted-tournament-core.module";
import { HostedTournamentController } from "./hosted-tournament.controller";
import { HostedTournamentService } from "./hosted-tournament.service";

@Module({
  imports: [
    HostedTournamentCoreModule,
    TierListModule,
    TeamModule,
    CoachModule,
    DiscordModule,
    DraftCoreModule,
    StageModule,
    LeagueMatchupModule,
  ],
  controllers: [HostedTournamentController],
  providers: [HostedTournamentService],
  exports: [HostedTournamentCoreModule],
})
export class HostedTournamentModule {}
