import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ReplayParseService } from "./replay-parse.service";
import { ReplayStatesService } from "./replay-states.service";
import { ReplayAnalysisService } from "./replay-analysis.service";

const REPLAY_URL_PATTERN =
  /^replay\.pokemonshowdown\.com\/[a-zA-Z0-9\-._~:/?#[\]\\@!$&'()*+,;=]+$/;
const FETCH_TIMEOUT_MS = 10_000;

@Controller("replay/analyze")
export class ReplayAnalysisController {
  constructor(
    private readonly replayParseService: ReplayParseService,
    private readonly replayStatesService: ReplayStatesService,
    private readonly replayAnalysisService: ReplayAnalysisService,
  ) {}

  @Get("v2") // Still in development
  async analyzeReplayV2(@Query("url") url: string) {
    const replayLog = await this.fetchReplayLog(url);
    return this.runPipeline(replayLog);
  }

  @Post("v2") // Still in development
  analyzeReplayLogV2(@Body("log") log: unknown) {
    if (typeof log !== "string" || !log.includes("|")) {
      throw new PDZError(ErrorCodes.PARAMS.REQUIRED);
    }
    return this.runPipeline(log);
  }

  private runPipeline(replayLog: string) {
    const parsedReplay = this.replayParseService.parse(replayLog);
    const built = this.replayStatesService.build(parsedReplay);
    const analysis = this.replayAnalysisService.analyze(built);
    return {
      analysis,
      warnings: {
        args: parsedReplay.argValidationWarnings,
        build: built.warnings,
        unknownActions: parsedReplay.unknownActions,
      },
    };
  }

  private async fetchReplayLog(url: string): Promise<string> {
    const decodedUrl = this.decodeUrl(url);
    if (!REPLAY_URL_PATTERN.test(decodedUrl)) {
      throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    }

    let response: Response;
    try {
      response = await fetch(`${this.formatUrl(decodedUrl)}.log`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new PDZError(ErrorCodes.REPLAY.FETCH_FAILED);
    }
    if (!response.ok) throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    return response.text();
  }

  private decodeUrl(url: string): string {
    if (!url) throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    try {
      return decodeURI(url).replace(/^https?:\/\//, "");
    } catch {
      // Malformed percent-encoding is a client error, not a server crash.
      throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
    }
  }

  private formatUrl(url: string): string {
    const plainUrl = url.split("?")[0].split("#")[0];
    return `https://${plainUrl}`;
  }
}
