import { BusinessExceptionFilter } from "@core/filters/business-exception.filter";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const bootstrapLogger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  const allowedOrigins = configService
    .get<string>("ALLOWED_ORIGINS")
    ?.split(",") || ["http://localhost:4200"];

  app.enableCors({
    origin: (
      origin: string,
      callback: (arg0: Error | null, arg1: boolean) => any,
    ) => {
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle("Pokémon DraftZone API")
    .setDescription("The backend API documentation for Pokémon DraftZone")
    .setVersion("4.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT", in: "header" },
      "JWT-auth",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);
  bootstrapLogger.log("Swagger UI initialized on /docs");

  const port = configService.get<number>("PORT") || 9960;
  await app.listen(port);

  bootstrapLogger.log(
    `Pokémon DraftZone Server successfully running on port ${port}`,
  );
}

process.on("unhandledRejection", (reason: any, promise) => {
  Logger.error(
    `Unhandled Rejection at Promise: ${promise}, reason: ${reason?.stack || reason}`,
    "ProcessLifecycle",
  );
});

bootstrap();
