import { Request, Response } from "express";
import { RouteOld } from ".";
import {
  formatUrl,
  Replay,
  validateUrl,
} from "../services/replay-services/replay-analyze.service";
import { PDZError } from "../errors/pdz-error";
import { ErrorCodes } from "../errors/error-codes";
import { createRoute } from "./route-builder";
import z from "zod";

type ReplayResponse = Response & { url?: string };

export const ReplayRoutes: RouteOld = {
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

function URLHandler<T>(
  req: Request,
  res: Response,
  ctx: T,
  url: string,
): { url: string } {
  const decodedUrl = decodeURI(url).replace(/^https?:\/\//, "");
  const urlPattern = /^replay\.pokemonshowdown\.com\/.+$/;
  if (!urlPattern.test(decodedUrl))
    throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
  if (!validateUrl(decodedUrl))
    throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
  return { url: decodedUrl };
}

export const ReplayRoute = createRoute()((r) => {
  r.path("analyze")((r) => {
    r.param(
      "url",
      URLHandler,
    )((r) => {
      r.get(async (req, res, ctx) => {
        const replayData = await fetch(`${formatUrl(ctx.url)}.log`);
        const replay = new Replay.Analysis(await replayData.text());
        res.json(replay.toJson());
      });
    });
  });
  r.path("log")((r) => {
    r.param(
      "url",
      URLHandler,
    )((r) => {
      r.get(async (req, res, ctx) => {
        const replayData = await fetch(`${formatUrl(ctx.url)}.log`);
        res.send(await replayData.text());
      });
    });
  });
});
