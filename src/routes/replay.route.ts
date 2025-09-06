import { Request, Response } from "express";
import { Route } from ".";
import {
  formatUrl,
  Replay,
  validateUrl,
} from "../services/replay-services/replay-analyze.service";

type ReplayResponse = Response & { url?: string };

export const ReplayRoutes: Route = {
  subpaths: {
    "/analyze/:url": {
      get: async (req: Request, res: ReplayResponse) => {
        try {
          if (!res.url || !validateUrl(res.url))
            return res
              .status(400)
              .json({ message: "Invalid URL Format", code: "RA-R1-01" });
          const replayData = await fetch(`${formatUrl(res.url)}.log`);
          let replay = new Replay.Analysis(await replayData.text());
          res.json(replay.toJson());
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "RA-R1-02" });
        }
      },
    },
    "/log/:url": {
      get: async (req: Request, res: ReplayResponse) => {
        try {
          if (!res.url || !validateUrl(res.url))
            return res
              .status(400)
              .json({ message: "Invalid URL Format", code: "RA-R2-01" });
          const replayData = await fetch(`https://${formatUrl(res.url)}.log`);
          res.send(await replayData.text());
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "RA-R2-02" });
        }
      },
    },
  },
  params: {
    url: async (req: Request, res: ReplayResponse, next, url) => {
      try {
        if (url == null) {
          return res
            .status(400) // Bad Request
            .json({ message: "URL not provided.", code: "RA-P1-01" });
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
    },
  },
};
