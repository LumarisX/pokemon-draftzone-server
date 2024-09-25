import express, { Request, Response } from "express";
import { SubRequest } from "../app";
import { Replay } from "../services/replay-services/replay-analyze.service";
import { Routes } from ".";

export const replayRouter = express.Router();

type ReplayResponse = Response & { url?: string };

const ReplayRoutes: Routes = [
  {
    path: "/analyze/:url",
    get: async (req: Request, res: ReplayResponse) => {
      try {
        const replayData = await fetch(`https://${res.url}.log`);
        let replay = new Replay(await replayData.text());
        res.json(replay.analyze());
      } catch (error) {
        console.error("Error in /formats/ route:", error);
        res
          .status(500)
          .json({ error: "Internal Server Error", code: "RA-R1-01" });
      }
    },
  },
  {
    path: "/log/:url",
    get: async (req: Request, res: ReplayResponse) => {
      try {
        const replayData = await fetch(`https://${res.url}.log`);
        res.send(await replayData.text());
      } catch (error) {
        console.error("Error in /formats/ route:", error);
        res
          .status(500)
          .json({ error: "Internal Server Error", code: "RA-R1-01" });
      }
    },
  },
];

ReplayRoutes.forEach((entry) => {
  const route = replayRouter.route(entry.path);
  if (entry.get) route.get(entry.get);
  if (entry.patch) route.patch(entry.patch);
  if (entry.post) route.post(entry.post);
  if (entry.delete) route.delete(entry.delete);
});

replayRouter.param(
  "url",
  async (req: SubRequest, res: ReplayResponse, next, url) => {
    try {
      if (url == null) {
        return res
          .status(400)
          .json({ message: "Team id not found", code: "DR-P1-01" });
      } else {
        url = decodeURI(url).replace(/^https?:\/\//, "");
        const urlPattern = /^replay\.pokemonshowdown\.com\/.+$/;
        if (!urlPattern.test(url)) {
          return res
            .status(400)
            .json({ error: "Invalid URL format", code: "RA-R1-02" });
        }
        res.url = url;
      }
    } catch (error) {
      return res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-P1-04" });
    }
    next();
  }
);
