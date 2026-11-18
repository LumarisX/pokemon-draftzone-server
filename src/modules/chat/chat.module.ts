import { CoachModule } from "@modules/coach/coach.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { UserModule } from "@modules/user/user.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ChatReportRepository } from "./chat-report.repository";
import { ChatReportEntity, ChatReportSchema } from "./chat-report.schema";
import { ChatReportService } from "./chat-report.service";
import { ChatController } from "./chat.controller";
import { ChatRepository } from "./chat.repository";
import {
  TournamentMessageEntity,
  TournamentMessageSchema,
} from "./chat.schema";
import { ChatService } from "./chat.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TournamentMessageEntity.name, schema: TournamentMessageSchema },
      { name: ChatReportEntity.name, schema: ChatReportSchema },
    ]),
    TeamModule,
    CoachModule,
    LeagueMatchupModule,
    HostedTournamentCoreModule,
    UserModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatRepository,
    ChatReportService,
    ChatReportRepository,
  ],
  exports: [ChatRepository, ChatReportService],
})
export class ChatModule {}
