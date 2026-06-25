import { StorageModule } from "@core/storage/storage.module";
import { AgendaModule } from "@modules/agenda/agenda.module";
import { ArchiveModule } from "@modules/archive/archive.module";
import { DataModule } from "@modules/data/data.module";
import { DraftModule } from "@modules/draft/draft.module";
import { LeagueModule } from "@modules/league/league.modules";
import { MatchupModule } from "@modules/matchup/matchup.module";
import { PlannerModule } from "@modules/planner/planner.module";
import { ReplayLegacyModule } from "@modules/replay-analysis-legacy/replay-legacy.module";
import { ReplayAnalysisModule } from "@modules/replay-analyzer/replay-analysis.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeambuilderModule } from "@modules/teambuilder/teambuilder.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { TournamentAdModule } from "@modules/tournament-ad/tournament-ad.module";
import { TournamentModule } from "@modules/tournament/tournament.module";
import { UploadsModule } from "@modules/upload/upload.module";
import { UserModule } from "@modules/user/user.module";
import { WebhookModule } from "@modules/webhook/webhook.module";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { MongooseModule } from "@nestjs/mongoose";
import mongoose from "mongoose";
import { AuthModule } from "./modules/auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbLogger = new Logger("Database");

        const dbUser = configService.get<string>("MONGODB_USER");
        const dbPass = configService.get<string>("MONGODB_PASS");
        const uri = `mongodb+srv://${dbUser}:${dbPass}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;

        dbLogger.log("Attempting MongoDB connection...");

        return {
          uri,

          connectionFactory: async (connection) => {
            connection.on("connected", () => {
              dbLogger.log("MongoDB connected successfully.");
            });

            connection.on("disconnected", () => {
              dbLogger.warn("MongoDB disconnected.");
            });

            connection.on("reconnected", () => {
              dbLogger.log("MongoDB reconnected.");
            });

            connection.on("error", (error: { stack: any }) => {
              dbLogger.error(
                "MongoDB connection error (post-initialization):",
                error.stack,
              );
            });

            if (mongoose.connection.readyState === 0) {
              await mongoose.connect(uri);
              dbLogger.log(
                "Default mongoose connection established for legacy models.",
              );
            }

            return connection;
          },
        };
      },
    }),
    AgendaModule,
    ArchiveModule,
    AuthModule,
    DataModule,
    DraftModule,
    StageModule,
    LeagueModule,
    MatchupModule,
    PlannerModule,
    ReplayAnalysisModule,
    ReplayLegacyModule,
    StorageModule,
    TeambuilderModule,
    TierListModule,
    TournamentAdModule,
    TournamentModule,
    UploadsModule,
    UserModule,
    WebhookModule,
  ],
})
export class AppModule {}
