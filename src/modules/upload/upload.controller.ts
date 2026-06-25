import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { RequestUploadUrlDto } from "./upload.dto";
import { UploadsThrottlerGuard } from "./upload-throttler.guard";
import { UploadsService } from "./upload.service";

@Controller("uploads")
@UseGuards(JwtAuthGuard, UploadsThrottlerGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("presigned-url")
  async createPresignedUrl(@Body() body: RequestUploadUrlDto) {
    return this.uploadsService.createPresignedUpload(body);
  }
}
