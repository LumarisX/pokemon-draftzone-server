import { CoachModule } from "@modules/coach/coach.module";
import { LeagueMatchupModule } from "@modules/matchup/sub-modules/league-matchup/league-matchup.module";
import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
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
    ]),
    TeamModule,
    CoachModule,
    LeagueMatchupModule,
    forwardRef(() => HostedTournamentCoreModule),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
  exports: [ChatRepository],
})
export class ChatModule {}
