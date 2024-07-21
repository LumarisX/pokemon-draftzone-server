import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import mongoSanitize from "express-mongo-sanitize";
import { auth } from "express-oauth2-jwt-bearer";
import createError from "http-errors";
import mongoose, { ObjectId } from "mongoose";
import path from "path";
import logger from "morgan";
import { draftRouter } from "./routes/draft.route";
import { matchupRouter } from "./routes/matchup.route";
import { testRouter } from "./routes/test.route";
import { dataRouter } from "./routes/data.route";
import { plannerRouter } from "./routes/planner.route";
import dotenv from "dotenv";
import { replayRouter } from "./routes/replay.route";
import { archiveRouter } from "./routes/archive.route";

dotenv.config();

mongoose.connect(
  `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`
);

const db = mongoose.connection;
db.on("error", (error) => console.error(error));
db.once("open", () => console.log("Connected to Database"));

export const app = express();

const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER,
  tokenSigningAlg: "RS256",
});

app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "pug");
app.set("trust proxy", true);

app.use(
  mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ req, key }: { req: Request; key: string }) => {
      console.warn(`This request[${key}] is sanitized`, req);
    },
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.json());
app.use(cors());

app.use("/draft", logger("common"), jwtCheck, getSub, draftRouter);
app.use("/archive", logger("common"), jwtCheck, getSub, archiveRouter);
app.use("/matchup", logger("common"), matchupRouter);
app.use("/data", logger("common"), dataRouter);
app.use("/test", logger("common"), testRouter);
app.use("/replay", logger("common"), replayRouter);
app.use("/planner", logger("common"), plannerRouter);

// app.use("/data", dataRouter);

app.use(function (req: Request, res: Response, next: NextFunction) {
  next(createError(404));
});

app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});

export type SubRequest = Request & {
  sub?: ObjectId;
};

function getSub(req: SubRequest, res: Response, next: NextFunction) {
  try {
    if (req.headers && req.headers.authorization) {
      let jwt = req.headers.authorization.split(" ")[1];
      req.sub = JSON.parse(atob(jwt.split(".")[1])).sub;
    }
    next();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
}
