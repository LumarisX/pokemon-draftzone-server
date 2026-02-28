import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import mongoSanitize from "express-mongo-sanitize";
import fs from "fs";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import winston from "winston";
import "winston-daily-rotate-file";
import { config } from "./config";
import { ErrorCodes } from "./errors/error-codes";
import { errorHandler } from "./errors/error-handler";
import { PDZError } from "./errors/pdz-error";
import { loggingContext } from "./middleware/loggingContext";
import { RouteOld } from "./routes";
import { ArchiveRoute } from "./routes-new/archive.route";
import { DraftRoute } from "./routes-new/draft.route";
import { FileRoute } from "./routes-new/file.route";
import { LeagueRoute } from "./routes-new/league.route";
import { MatchupRoute } from "./routes-new/matchup.route";
import { Route } from "./routes-new/route-builder";
import { DataRoutes } from "./routes/data.route";
import { NewsRoutes } from "./routes/news.route";
import { PlannerRoutes } from "./routes/planner.route";
import { SupporterRoutes } from "./routes/supporters.route";
import { TeambuilderRoutes } from "./routes/teambuilder.route";
import { UserRoutes } from "./routes/user.route";
import { ReplayRoute } from "./routes-new/replay.route";

const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir);
    console.log(`Log directory created: ${logDir}`);
  } catch (err) {
    console.error(`Could not create log directory: ${logDir}`, err);
  }
}

export const logger = winston.createLogger({
  level: config.NODE_ENV === "development" ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "app-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "app-error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
      level: "error",
    }),
  ],
});

const routerLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, message }) => {
      if (typeof message === "object" && message !== null) {
        return JSON.stringify({ ...message, timestamp });
      }
      return JSON.stringify({ message, timestamp });
    }),
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "router-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),
  ],
});

if (config.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(
          (info) =>
            `${info.timestamp} ${info.level}: ${info.message} ${
              info.stack || ""
            }`,
        ),
      ),
    }),
  );
} else {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
      ),
      stderrLevels: ["error"],
    }),
  );
}

export const app = express();

app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "pug");
app.set("trust proxy", true);

app.use(helmet());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.json());

app.use(loggingContext);

app.use(
  mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ req, key }: { req: Request; key: string }) => {
      req.logger.warn(`Request field sanitized`, {
        key,
        path: req.originalUrl,
        ip: req.ip,
      });
    },
  }),
);

const allowedOrigins = [
  "https://dqptrox2bn9qw.cloudfront.net",
  "https://pokemondraftzone.com",
  "http://localhost:4200",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);

// Morgan setup for router logging
morgan.token("id", (req: Request) => req.id);
morgan.token(
  "user-id",
  (req: Request) => req.auth?.payload?.sub || "unauthenticated",
);
morgan.token("body-length", (req: Request) => req.bodyLength.toString());
morgan.token("body-hash", (req: Request) => req.bodyHash);

const morganJSONFormat = (
  tokens: morgan.TokenIndexer<Request, Response>,
  req: Request,
  res: Response,
) => {
  return JSON.stringify({
    "request-id": tokens.id(req, res),
    "user-id": tokens["user-id"](req, res),
    "remote-address": tokens["remote-addr"](req, res),
    "remote-user": tokens["remote-user"](req, res),
    "http-version": tokens["http-version"](req, res),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: tokens.status(req, res),
    "response-time": tokens["response-time"](req, res, "ms"),
    "content-length": tokens.res(req, res, "content-length"),
    "request-body-length": tokens["body-length"](req, res),
    "request-body-hash": tokens["body-hash"](req, res),
    referrer: tokens.referrer(req, res),
    "user-agent": tokens["user-agent"](req, res),
  });
};

const routerStream = {
  write: (message: string) => {
    routerLogger.info(JSON.parse(message));
  },
};

app.use(morgan(morganJSONFormat, { stream: routerStream }));

export const ROUTES: { [path: string]: RouteOld | Route } = {
  "/draft": DraftRoute,
  "/archive": ArchiveRoute,
  "/matchup": MatchupRoute,
  "/data": DataRoutes,
  "/replay": ReplayRoute,
  "/planner": PlannerRoutes,
  "/leagues": LeagueRoute,
  "/teambuilder": TeambuilderRoutes,
  "/supporters": SupporterRoutes,
  "/user": UserRoutes,
  "/news": NewsRoutes,
  "/file": FileRoute,
};

const METHODS = ["get", "post", "delete", "patch"] as const;

for (const path in ROUTES) {
  const route = ROUTES[path];
  if (route instanceof Route) {
    app.use(path, route.getRouter());
  } else {
    const router = express.Router();
    for (const subpath in route.subpaths) {
      const subroute = router.route(subpath);
      for (const method of METHODS) {
        if (route.subpaths[subpath][method])
          subroute[method](
            ...(route.subpaths[subpath].middleware ?? []),
            route.subpaths[subpath][method],
          );
      }
    }
    if (route.params)
      for (const param in route.params) {
        router.param(param, route.params[param]);
      }

    app.use(path, ...(route.middleware || []), router);
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  next(new PDZError(ErrorCodes.SYSTEM.NOT_FOUND));
});

app.use(errorHandler);
