import { Controller, Get, Query } from "@nestjs/common";
import { ReplayAnalyzerService } from "./replay-legacy.service";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { validateUrl } from "./replay-legacy.types";

@Controller("replay/analyze")
export class ReplayLegacyController {
  // Note: v1 uses a static factory (ReplayAnalyzerService.fromReplayUrl),
  // not an injected instance method, so DI is not used here. This mirrors
  // the original express-era behavior 1:1 and is intentionally left as-is.
  @Get()
  async analyzeReplay(@Query("url") url: string) {
    const decodedUrl = decodeURI(url).replace(/^https?:\/\//, "");
    const urlPattern = /^replay\.pokemonshowdown\.com\/.+$/;
    if (!urlPattern.test(decodedUrl))
      throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    if (!validateUrl(decodedUrl))
      throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    const replay = await ReplayAnalyzerService.fromReplayUrl(decodedUrl);
    return replay?.toClient();
  }
}
