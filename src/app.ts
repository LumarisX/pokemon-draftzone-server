import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import mongoSanitize from "express-mongo-sanitize";
import createError from "http-errors";
import mongoose from "mongoose";
import logger from "morgan";
import path from "path";
import { Route } from "./routes";
import { ArchiveRoutes } from "./routes/archive.route";
import { DataRoutes } from "./routes/data.route";
import { DraftRoutes } from "./routes/draft.route";
import { MatchupRoutes } from "./routes/matchup.route";
import { PlannerRoutes } from "./routes/planner.route";
import { ReplayRoutes } from "./routes/replay.route";
import { LeagueAdRoutes } from "./routes/league-ad.route";

mongoose.connect(
  `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`
);

const db = mongoose.connection;
db.on("error", (error) => console.error(error));
db.once("open", () => console.log("Connected to Database"));

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
};

for (const path in ROUTES) {
  const route = ROUTES[path];
  const router = express.Router();
  for (const subpath in route.subpaths) {
    const subroute = router.route(subpath);
    if (route.subpaths[subpath].get) subroute.get(route.subpaths[subpath].get);
    if (route.subpaths[subpath].post)
      subroute.post(route.subpaths[subpath].post);
    if (route.subpaths[subpath].delete)
      subroute.delete(route.subpaths[subpath].delete);
    if (route.subpaths[subpath].patch)
      subroute.patch(route.subpaths[subpath].patch);
  }
  app.use(path, logger("common"), ...(route.middleware || []), router);
}

app.use(function (req: Request, res: Response, next: NextFunction) {
  next(createError(404));
});

app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});
