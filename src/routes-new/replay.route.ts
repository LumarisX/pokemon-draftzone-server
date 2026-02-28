import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import {
  formatUrl,
  Replay,
  validateUrl,
} from "../services/replay-services/replay-analyze.service";

import { createRoute } from "./route-builder";

function URLHandler<T>(ctx: T, url: string): { url: string } {
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
      r.get(async (ctx) => {
        const replay = await Replay.Analysis.fromReplayUrl(ctx.url);

        return replay?.toJson();
      });
    });
  });
  r.path("log")((r) => {
    r.param(
      "url",
      URLHandler,
    )((r) => {
      r.get(async (ctx, req, res) => {
        const replayData = await fetch(`${formatUrl(ctx.url)}.log`);
        res.send(await replayData.text());
      });
    });
  });
});
