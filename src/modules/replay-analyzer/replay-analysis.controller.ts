import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ReplayParseService } from "./replay-parse.service";
import { ReplayStatesService } from "./replay-states.service";
import { ReplayAnalysisService } from "./replay-analysis.service";
import { fetchReplayLog } from "./replay-fetch";

@Controller("replay/analyze")
@Throttle({ default: { ttl: 60_000, limit: 20 } })
export class ReplayAnalysisController {
  constructor(
    private readonly replayParseService: ReplayParseService,
    private readonly replayStatesService: ReplayStatesService,
    private readonly replayAnalysisService: ReplayAnalysisService,
  ) {}

  @Get("v2")
  async analyzeReplayV2(@Query("url") url: string) {
    const replayLog = await fetchReplayLog(url);
    return this.runPipeline(replayLog);
  }

  @Post("v2")
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

}
