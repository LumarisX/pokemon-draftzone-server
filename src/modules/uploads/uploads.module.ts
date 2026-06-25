import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ThrottlerModule } from "@nestjs/throttler";
import { FileUploadEntity, FileUploadSchema } from "./file-upload.schema";
import { FileUploadRepository } from "./file-upload.repository";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { UploadsThrottlerGuard } from "./uploads-throttler.guard";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FileUploadEntity.name, schema: FileUploadSchema },
    ]),
    // 20 presign requests per minute per user is generous for real usage
    // while still capping a spamming/compromised account.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, UploadsThrottlerGuard, FileUploadRepository],
  exports: [UploadsService],
})
export class UploadsModule {}
