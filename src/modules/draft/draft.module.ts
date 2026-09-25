import { AgendaModule } from "@modules/agenda/agenda.module";
import { CoachModule } from "@modules/coach/coach.module";
import { DiscordModule } from "@modules/discord/discord.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeamModule } from "@modules/team/team.module";
import { forwardRef, Module } from "@nestjs/common";
import { DraftCoreModule } from "./draft-core.module";
import { DraftEngineService } from "./draft-engine.service";
import { DraftEventsService } from "./draft-events.service";
import { DraftController } from "./draft.controller";
import { DraftPoolsController } from "./draft-pools.controller";
import { DraftStreamController } from "./draft-stream.controller";
import { DraftStreamService } from "./draft-stream.service";
import { DraftService } from "./draft.service";

@Module({
  imports: [
    DraftCoreModule,
    CoachModule,
    HostedTournamentCoreModule,
    TeamModule,
    StageModule,
    LeagueMatchupModule,
    DiscordModule,
    forwardRef(() => AgendaModule),
  ],
  controllers: [DraftPoolsController, DraftController, DraftStreamController],
  providers: [
    DraftService,
    DraftEngineService,
    DraftEventsService,
    DraftStreamService,
  ],
  exports: [DraftCoreModule, DraftEngineService],
})
export class DraftModule {}
