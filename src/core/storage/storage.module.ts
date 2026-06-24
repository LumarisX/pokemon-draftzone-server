import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { S3Service } from "./s3.service";

/**
 * Global so any feature module can inject S3Service without adding it to
 * every module's imports - import this once from AppModule.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [S3Service],
  exports: [S3Service],
})
export class StorageModule {}
