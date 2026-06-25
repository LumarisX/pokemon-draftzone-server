import { AgendaModule } from "@modules/agenda/agenda.module";
import { DiscordModule } from "@modules/discord/discord.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeamModule } from "@modules/team/team.module";
import { forwardRef, Module } from "@nestjs/common";
import { DraftCoreModule } from "./draft-core.module";
import { DraftEngineService } from "./draft-engine.service";
import { DraftEventsService } from "./draft-events.service";
import { DraftController } from "./draft.controller";
import { DraftService } from "./draft.service";

@Module({
  imports: [
    DraftCoreModule,
    TeamModule,
    StageModule,
    LeagueMatchupModule,
    DiscordModule,
    forwardRef(() => AgendaModule),
  ],
  controllers: [DraftController],
  providers: [DraftService, DraftEngineService, DraftEventsService],
  exports: [DraftCoreModule, DraftEngineService],
})
export class DraftModule {}
