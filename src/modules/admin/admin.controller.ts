import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Roles } from "@modules/auth/roles.decorator";
import { RolesGuard } from "@modules/auth/roles.guard";
import { UserRole } from "@modules/user/user.schema";
import { User } from "@core/decorators/user.decorator";
import { ChatReportService } from "@modules/chat/chat-report.service";
import { ResolveChatReportDto } from "@modules/chat/chat.dto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAccountService } from "./admin-account.service";
import {
  AccountNoteDto,
  ResetDisplayNameDto,
  TransferAccountDto,
} from "./admin.dto";
import { AdminService } from "./admin.service";
import { BucketUnit } from "./admin.repository";

const BUCKETS: BucketUnit[] = ["day", "week", "month"];

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly chatReports: ChatReportService,
    private readonly accounts: AdminAccountService,
  ) {}

  @Post("users/reset-display-name")
  resetDisplayName(@User() sub: string, @Body() body: ResetDisplayNameDto) {
    return this.adminService.resetDisplayName(sub, body);
  }

  @Post("accounts/lock")
  lockAccount(@User() sub: string, @Body() body: AccountNoteDto) {
    return this.accounts.lock(sub, body);
  }

  @Post("accounts/unlock")
  unlockAccount(@User() sub: string, @Body() body: AccountNoteDto) {
    return this.accounts.unlock(sub, body);
  }

  @Post("accounts/transfer")
  transferAccount(@User() sub: string, @Body() body: TransferAccountDto) {
    return this.accounts.transfer(sub, body);
  }

  @Post("accounts/transfer/undo")
  undoAccountTransfer(@User() sub: string, @Body() body: AccountNoteDto) {
    return this.accounts.undoTransfer(sub, body);
  }

  @Get("accounts/:profileId")
  describeAccount(@Param("profileId") profileId: string) {
    return this.accounts.describe(profileId);
  }

  @Get("chat-reports")
  getChatReports() {
    return this.chatReports.listEscalated();
  }

  @Post("chat-reports/:reportId/resolve")
  resolveChatReport(
    @User() sub: string,
    @Param("reportId") reportId: string,
    @Body() body: ResolveChatReportDto,
  ) {
    return this.chatReports.resolveEscalated(reportId, sub, body.action);
  }

  @Get("users/summary")
  getSummary() {
    return this.adminService.getSummary();
  }

  @Get("users/login-providers")
  getLoginProviders() {
    return this.adminService.getLoginProviders();
  }

  @Get("users/engagement")
  getEngagement() {
    return this.adminService.getEngagement();
  }

  @Get("users/account-age")
  getAccountAge() {
    return this.adminService.getAccountAge();
  }

  @Get("users/settings-distribution")
  getSettingsDistribution() {
    return this.adminService.getSettingsDistributions();
  }

  @Get("users/time-series")
  getTimeSeries(@Query("bucket") bucket = "day") {
    if (!BUCKETS.includes(bucket as BucketUnit)) {
      throw new BadRequestException(
        `bucket must be one of: ${BUCKETS.join(", ")}`,
      );
    }
    return this.adminService.getTimeSeries(bucket as BucketUnit);
  }
}
