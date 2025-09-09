import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import mongoSanitize from "express-mongo-sanitize";
import fs from "fs";
import helmet from "helmet";
import createError from "http-errors";
import morgan from "morgan";
import path from "path";
import winston from "winston";
import "winston-daily-rotate-file";
import { config } from "./config";
import { loggingContext } from "./middleware/loggingContext";
import { Route } from "./routes";
import { ArchiveRoutes } from "./routes/archive.route";
import { BattleZoneRoutes } from "./routes/battlezone.route";
import { DataRoutes } from "./routes/data.route";
import { DraftRoutes } from "./routes/draft.route";
import { LeagueAdRoutes } from "./routes/league-ad.route";
import { MatchupRoutes } from "./routes/matchup.route";
import { NewsRoutes } from "./routes/news.route";
import { PlannerRoutes } from "./routes/planner.route";
import { ReplayRoutes } from "./routes/replay.route";
import { PushSubscriptionRoutes } from "./routes/subscription.route";
import { SupporterRoutes } from "./routes/supporters.route";
import { TeambuilderRoutes } from "./routes/teambuilder.route";
import { UserRoutes } from "./routes/user.route";

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
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "app-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
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
    })
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
            }`
        )
      ),
    })
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
  })
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
  })
);

// Morgan setup for router logging
morgan.token("id", (req: Request) => req.id);
morgan.token(
  "user-id",
  (req: Request) => req.auth?.payload?.sub || "unauthenticated"
);
morgan.token("body-length", (req: Request) => req.bodyLength.toString());
morgan.token("body-hash", (req: Request) => req.bodyHash);

const morganJSONFormat = (
  tokens: morgan.TokenIndexer<Request, Response>,
  req: Request,
  res: Response
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

export const ROUTES: { [path: string]: Route } = {
  "/draft": DraftRoutes,
  "/archive": ArchiveRoutes,
  "/matchup": MatchupRoutes,
  "/data": DataRoutes,
  "/replay": ReplayRoutes,
  "/planner": PlannerRoutes,
  "/leagues": LeagueAdRoutes,
  "/teambuilder": TeambuilderRoutes,
  "/supporters": SupporterRoutes,
  "/battlezone": BattleZoneRoutes,
  "/user": UserRoutes,
  "/push": PushSubscriptionRoutes,
  "/news": NewsRoutes,
};

const METHODS = ["get", "post", "delete", "patch"] as const;

for (const path in ROUTES) {
  const route = ROUTES[path];
  const router = express.Router();
  for (const subpath in route.subpaths) {
    const subroute = router.route(subpath);
    for (const method of METHODS) {
      if (route.subpaths[subpath][method])
        subroute[method](
          ...(route.subpaths[subpath].middleware ?? []),
          route.subpaths[subpath][method]
        );
    }
  }
  if (route.params)
    for (const param in route.params) {
      router.param(param, route.params[param]);
    }
  app.use(path, ...(route.middleware || []), router);
}

app.use((req: Request, res: Response, next: NextFunction) => {
  next(createError(404));
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";

  req.logger.error(`Error processing request`, {
    status,
    message,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    error: err,
  });
  res.status(status).json({
    error: {
      message: message,
      stack: config.NODE_ENV === "development" ? err.stack : undefined,
    },
  });
});
