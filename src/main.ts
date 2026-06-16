import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { BusinessExceptionFilter } from "@core/filters/business-exception.filter";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { agenda, startRecurringJobs } from "./agenda";

async function bootstrap() {
  const bootstrapLogger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const allowedOrigins = [
    "https://dqptrox2bn9qw.cloudfront.net",
    "https://pokemondraftzone.com",
    "http://localhost:4200",
  ];

  app.enableCors({
    origin: (
      origin: string,
      callback: (arg0: Error | null, arg1: boolean) => any,
    ) => {
      // Allow server-to-server requests or tools like Postman (no origin header)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  });

  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalFilters(new BusinessExceptionFilter());

  const nestLoggerBridge = {
    log: (msg: string) => Logger.log(msg),
    info: (msg: string) => Logger.log(msg),
    error: (msg: string, trace?: string) => Logger.error(msg, trace),
    warn: (msg: string) => Logger.warn(msg),
    debug: (msg: string) => Logger.debug(msg),
  };
  try {
    await agenda.start();
    await startRecurringJobs();
    bootstrapLogger.log("Agenda background jobs initialized.");

    // await startDiscordBot(nestLoggerBridge);
    // bootstrapLogger.log("Discord bot initialized.");
  } catch (err) {
    bootstrapLogger.error("Failed to initialize sidecar services", err);
  }

  //   const httpServer = app.getHttpServer();
  //   startWebSocket(nestLoggerBridge, httpServer);

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT") || 9960;
  await app.listen(port);

  bootstrapLogger.log(
    `Pokémon DraftZone Server successfully running on port ${port}`,
  );
}

process.on("unhandledRejection", (reason, promise) => {
  Logger.error(
    "Unhandled Rejection at:",
    JSON.stringify({ promise, reason }),
    "Process",
  );
});

bootstrap();
