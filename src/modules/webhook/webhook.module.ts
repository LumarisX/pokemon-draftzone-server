import { Module } from "@nestjs/common";
import { WebhookController } from "./webhook.controller";
import { UserModule } from "@modules/user/user.module";

@Module({
  imports: [UserModule],
  controllers: [WebhookController],
  providers: [],
  exports: [],
})
export class WebhookModule {}
