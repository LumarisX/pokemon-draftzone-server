import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ErrorReportDto } from "./error-report.dto";
import { ErrorReportService } from "./error-report.service";

@Controller("error-report")
@UseGuards(ThrottlerGuard, JwtAuthGuard)
@OptionalAuth()
@Throttle({ default: { ttl: 60_000, limit: 5 } })
export class ErrorReportController {
  constructor(private readonly errorReportService: ErrorReportService) {}

  @Post()
  async submit(@Body() dto: ErrorReportDto, @User() sub?: string) {
    const delivered = await this.errorReportService.submit(dto, sub);
    return { delivered };
  }
}
