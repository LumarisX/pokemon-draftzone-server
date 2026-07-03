import { CacheModule } from "@nestjs/cache-manager";
import { Global, Module } from "@nestjs/common";
import { AppCacheService } from "./app-cache.service";

@Global()
@Module({
  imports: [CacheModule.register()],
  providers: [AppCacheService],
  exports: [AppCacheService],
})
export class AppCacheModule {}
