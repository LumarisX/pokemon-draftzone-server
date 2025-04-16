import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import mongoSanitize from "express-mongo-sanitize";
import createError from "http-errors";
import mongoose from "mongoose";
import logger from "morgan";
import path from "path";
import { config } from "./config";
import { Route } from "./routes";
import { ArchiveRoutes } from "./routes/archive.route";
import { DataRoutes } from "./routes/data.route";
import { DraftRoutes } from "./routes/draft.route";
import { LeagueAdRoutes } from "./routes/league-ad.route";
import { MatchupRoutes } from "./routes/matchup.route";
import { PlannerRoutes } from "./routes/planner.route";
import { ReplayRoutes } from "./routes/replay.route";
import { SupporterRoutes } from "./routes/supporters.route";
import { TeambuilderRoutes } from "./routes/teambuilder.route";
import { BattleZoneRoutes } from "./routes/battlezone.route";
import { UserRoutes } from "./routes/user.route";
import { PushSubscriptionRoutes } from "./routes/subscription.route";
import { NewsRoutes } from "./routes/news.route";

mongoose
  .connect(
    `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`
  )
  .then(() => {
    console.log("Connected to Database");
  })
  .catch((error) => {
    console.error(`Failed to connect to the database: ${error.message}`);
  });

export const app = express();

app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "pug");
app.set("trust proxy", true);

app.use(
  mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ req, key }: { req: Request; key: string }) => {
      console.warn(`This request[${key}] is sanitized`, req.baseUrl);
    },
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.json());
app.use(cors());

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
  app.use(path, logger("common"), ...(route.middleware || []), router);
}

app.use(function (req: Request, res: Response, next: NextFunction) {
  next(createError(404));
});

app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      status: err.status || 500,
    },
  });
});
