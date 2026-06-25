import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ThrottlerModule } from "@nestjs/throttler";
import { FileUploadEntity, FileUploadSchema } from "./file-upload.schema";
import { FileUploadRepository } from "./file-upload.repository";
import { UploadsController } from "./upload.controller";
import { UploadsService } from "./upload.service";
import { UploadsThrottlerGuard } from "./upload-throttler.guard";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FileUploadEntity.name, schema: FileUploadSchema },
    ]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, UploadsThrottlerGuard, FileUploadRepository],
  exports: [UploadsService],
})
export class UploadsModule {}
