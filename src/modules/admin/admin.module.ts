import { ChatModule } from "@modules/chat/chat.module";
import { UserEntity, UserSchema } from "@modules/user/user.schema";
import { UserModule } from "@modules/user/user.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AdminAccountService } from "./admin-account.service";
import { AdminAuditRepository } from "./admin-audit.repository";
import { AdminAuditEntity, AdminAuditSchema } from "./admin-audit.schema";
import { AdminController } from "./admin.controller";
import { AdminRepository } from "./admin.repository";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    UserModule,
    ChatModule,
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: AdminAuditEntity.name, schema: AdminAuditSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminAccountService,
    AdminRepository,
    AdminAuditRepository,
  ],
})
export class AdminModule {}
