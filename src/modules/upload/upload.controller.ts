import { User } from "@core/decorators/user.decorator";
import { SkipGlobalThrottle } from "@core/guards/skip-global-throttle.decorator";
import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { RequestUploadUrlDto } from "./upload.dto";
import { UploadsService } from "./upload.service";

@Controller("uploads")
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@SkipGlobalThrottle()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("presigned-url")
  async createPresignedUrl(
    @User() sub: string,
    @Body() body: RequestUploadUrlDto,
  ) {
    return this.uploadsService.createPresignedUpload(body, sub);
  }
}
