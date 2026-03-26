import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import {
  formatUrl,
  Replay,
  validateUrl,
} from "../services/replay-services/replay.service";
import { ReplayAnalysisService } from "../services/replay-services/replay-analysis.service";
import { ReplayParseService } from "../services/replay-services/replay-parse.service";
import { ReplayStatesService } from "../services/replay-services/replay-states.service";

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

const replayParseService = new ReplayParseService();
const replayStatesService = new ReplayStatesService();
const replayAnalysisService = new ReplayAnalysisService();

export const ReplayRoute = createRoute()((r) => {
  r.path("analyze")((r) => {
    r.param(
      "url",
      URLHandler,
    )((r) => {
      r.get(async (ctx) => {
        const replay = await Replay.Analysis.fromReplayUrl(ctx.url);
        return replay?.toClient();
      });
    });
  });
  r.path("analyze-v2")((r) => {
    r.param(
      "url",
      URLHandler,
    )((r) => {
      r.get(async (ctx) => {
        const replayData = await fetch(`${formatUrl(ctx.url)}.log`);
        const replayLog = await replayData.text();
        const parsedReplay = replayParseService.parse(replayLog);
        const turnStates = replayStatesService.build(parsedReplay);
        const analysis = replayAnalysisService.analyze(turnStates);
        return {
          analysis,
          warnings: parsedReplay.argValidationWarnings,
        };
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
