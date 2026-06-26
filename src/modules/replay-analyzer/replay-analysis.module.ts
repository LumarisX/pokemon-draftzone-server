import { Module } from "@nestjs/common";
import { ReplayAnalysisController } from "./replay-analysis.controller";
import { ReplayParseService } from "./replay-parse.service";
import { ReplayStatesService } from "./replay-states.service";
import { ReplayAnalysisService } from "./replay-analysis.service";

@Module({
  controllers: [ReplayAnalysisController],
  providers: [ReplayParseService, ReplayStatesService, ReplayAnalysisService],
  exports: [ReplayParseService, ReplayStatesService, ReplayAnalysisService],
})
export class ReplayAnalysisModule {}
