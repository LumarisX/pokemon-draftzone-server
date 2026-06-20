import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Controller, Get, Query } from "@nestjs/common";
import { ReplayParseService } from "./replay-parse.service";
import { ReplayStatesService } from "./replay-states.service";
import { ReplayAnalysisService } from "./replay-analysis.service";

@Controller("replay/analyze")
export class ReplayAnalysisController {
  constructor(
    private readonly replayParseService: ReplayParseService,
    private readonly replayStatesService: ReplayStatesService,
    private readonly replayAnalysisService: ReplayAnalysisService,
  ) {}

  @Get("v2") // Still in development
  async analyzeReplayV2(@Query("url") url: string) {
    const decodedUrl = decodeURI(url).replace(/^https?:\/\//, "");
    const urlPattern = /^replay\.pokemonshowdown\.com\/.+$/;
    if (!urlPattern.test(decodedUrl))
      throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    if (!this.validateUrl(decodedUrl))
      throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    const replayData = await fetch(`${this.formatUrl(decodedUrl)}.log`);
    const replayLog = await replayData.text();
    const parsedReplay = this.replayParseService.parse(replayLog);
    const turnStates = this.replayStatesService.build(parsedReplay);
    const analysis = this.replayAnalysisService.analyze(turnStates);
    return {
      analysis,
      warnings: parsedReplay.argValidationWarnings,
    };
  }

  private validateUrl(url: string): boolean {
    const pattern =
      /^(https:\/\/)?replay\.pokemonshowdown\.com\/[a-zA-Z0-9\-._~:/?#[\]\\@!$&'()*+,;=]+$/;
    return pattern.test(url);
  }

  private formatUrl(url: string): string {
    if (!url) return url;
    if (!url.startsWith("https://")) {
      url = `https://${url}`;
    }
    const plainUrl = url.split("?")[0].split("#")[0];
    return plainUrl;
  }
}
