import { Request, Response } from "express";
import { Route } from ".";
import { SubRequest } from ".";
import { Replay } from "../services/replay-services/replay-analyze.service";

type ReplayResponse = Response & { url?: string };

export const ReplayRoutes: Route = {
  subpaths: {
    "/analyze/:url": {
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
    "/log/:url": {
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
  },
  params: {
    url: async (req: SubRequest, res: ReplayResponse, next, url) => {
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
    },
  },
};
