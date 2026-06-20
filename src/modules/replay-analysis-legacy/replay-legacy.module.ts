import { Module } from "@nestjs/common";
import { ReplayLegacyController } from "./replay-legacy.controller";

@Module({
  controllers: [ReplayLegacyController],
  // Registered as a provider for future injectability (e.g. if other
  // modules need it), even though the controller currently calls its
  // static factory method directly, matching v1's original usage.
  providers: [],
  exports: [],
})
export class ReplayLegacyModule {}
