import { Controller, Get, Logger, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { fetchReplayLog } from "@modules/replay-analyzer/replay-fetch";
import { ReplayAnalyzerService } from "./replay-legacy.service";

@Controller("replay/analyze")
@Throttle({ default: { ttl: 60_000, limit: 20 } })
export class ReplayLegacyController {
  private readonly logger = new Logger(ReplayLegacyController.name);

  @Get()
  async analyzeReplay(@Query("url") url: string) {
    const replay = new ReplayAnalyzerService(await fetchReplayLog(url));
    const result = replay.toClient();
    if (result.warnings.length)
      this.logger.warn(
        `Replay ${url} had ${result.warnings.length} unreadable line(s): ${result.warnings[0].message}`,
      );
    return result;
  }
}
