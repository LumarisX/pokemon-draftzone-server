import { AdminAuditRepository } from "@modules/admin/admin-audit.repository";
import {
  AdminAuditEntity,
  AdminAuditSchema,
} from "@modules/admin/admin-audit.schema";
import { CoachModule } from "@modules/coach/coach.module";
import { DiscordModule } from "@modules/discord/discord.module";
import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { TournamentApplicationModule } from "@modules/tournament-application/tournament-application.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AccountIdentityService } from "./account-identity.service";
import { AccountFootprintService } from "./account-footprint.service";
import { AccountMergeOfferService } from "./account-merge-offer.service";
import { AccountMergeRepository } from "./account-merge.repository";
import { AccountMergeService } from "./account-merge.service";
import { DiscordConnectService } from "./discord-connect.service";
import { DiscordNameSyncService } from "./discord-name-sync.service";
import { UserSignInRepository } from "./user-sign-in.repository";
import { UserSignInEntity, UserSignInSchema } from "./user-sign-in.schema";
import { UserController } from "./user.controller";
import { UserRepository } from "./user.repository";
import { UserEntity, UserSchema } from "./user.schema";
import { UserService } from "./user.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: UserEntity.name,
        schema: UserSchema,
      },
      {
        name: UserSignInEntity.name,
        schema: UserSignInSchema,
      },
      {
        name: AdminAuditEntity.name,
        schema: AdminAuditSchema,
      },
    ]),
    CoachModule,
    TeamModule,
    TournamentApplicationModule,
    HostedTournamentCoreModule,
    DiscordModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    DiscordConnectService,
    UserRepository,
    AccountIdentityService,
    DiscordNameSyncService,
    UserSignInRepository,
    AccountFootprintService,
    AccountMergeRepository,
    AccountMergeOfferService,
    AccountMergeService,
    AdminAuditRepository,
  ],
  exports: [
    UserService,
    UserRepository,
    AccountIdentityService,
    UserSignInRepository,
    AccountFootprintService,
    AccountMergeService,
  ],
})
export class UserModule {}
