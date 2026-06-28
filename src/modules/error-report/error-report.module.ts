import { DiscordModule } from "@modules/discord/discord.module";
import { Module } from "@nestjs/common";
import { ErrorReportController } from "./error-report.controller";
import { ErrorReportService } from "./error-report.service";

@Module({
  imports: [DiscordModule],
  controllers: [ErrorReportController],
  providers: [ErrorReportService],
})
export class ErrorReportModule {}
