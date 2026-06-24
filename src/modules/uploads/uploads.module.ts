import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { UploadsThrottlerGuard } from "./uploads-throttler.guard";

@Module({
  imports: [
    // 20 presign requests per minute per user is generous for real usage
    // while still capping a spamming/compromised account.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, UploadsThrottlerGuard],
  exports: [UploadsService],
})
export class UploadsModule {}
