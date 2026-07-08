import { BusinessExceptionFilter } from "@core/filters/business-exception.filter";
import { createAppLogger } from "@core/logging/winston-logger.factory";
import { BadRequestException, Logger, ValidationPipe } from "@nestjs/common";
import { ValidationError } from "class-validator";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { WinstonModule } from "nest-winston";
import path from "path";
import { AppModule } from "./app.module";

function collectValidationMessages(
  errors: ValidationError[],
  parentPath = "",
): string[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const messages = Object.values(error.constraints ?? {}).map((message) =>
      parentPath ? `${path}: ${message}` : message,
    );
    return [
      ...messages,
      ...collectValidationMessages(error.children ?? [], path),
    ];
  });
}

async function bootstrap() {
  const logDir = path.join(__dirname, "../logs");
  const winstonLogger = createAppLogger(logDir);

  const bootstrapLogger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({ instance: winstonLogger }),
  });

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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        const validationLogger = new Logger("ValidationPipe");
        validationLogger.error(
          `Request validation failed: ${JSON.stringify(errors)}`,
        );
        const messages = collectValidationMessages(errors);
        return new BadRequestException(
          messages.length ? messages.join("; ") : "Request validation failed",
        );
      },
    }),
  );

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
