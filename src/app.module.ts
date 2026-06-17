import { TournamentModule } from "@modules/tournament/tournament.module";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import mongoose from "mongoose";
import { AuthModule } from "./modules/auth/auth.module";
import { UserModule } from "@modules/user/user.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

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

    TournamentModule,
    AuthModule,
    UserModule,
  ],
})
export class AppModule {}
