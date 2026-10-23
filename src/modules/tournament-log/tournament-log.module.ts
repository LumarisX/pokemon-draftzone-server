import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { Module } from "@nestjs/common";
import { TournamentLogCoreModule } from "./tournament-log-core.module";
import { TournamentLogController } from "./tournament-log.controller";
import { TournamentLogService } from "./tournament-log.service";

@Module({
  imports: [TournamentLogCoreModule, HostedTournamentCoreModule, TeamModule],
  controllers: [TournamentLogController],
  providers: [TournamentLogService],
  exports: [TournamentLogService],
})
export class TournamentLogModule {}
