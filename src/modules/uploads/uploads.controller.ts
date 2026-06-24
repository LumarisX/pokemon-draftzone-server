import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { RequestUploadUrlDto } from "./uploads.dto";
import { UploadsThrottlerGuard } from "./uploads-throttler.guard";
import { UploadsService } from "./uploads.service";

@Controller("uploads")
@UseGuards(JwtAuthGuard, UploadsThrottlerGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("presigned-url")
  async createPresignedUrl(@Body() body: RequestUploadUrlDto) {
    return this.uploadsService.createPresignedUpload(body);
  }
}
