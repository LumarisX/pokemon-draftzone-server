import { CoachModule } from "@modules/coach/coach.module";
import { TeamModule } from "@modules/team/team.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { TournamentApplicationModule } from "@modules/tournament-application/tournament-application.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AccountIdentityService } from "./account-identity.service";
import { AccountFootprintService } from "./account-footprint.service";
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
    ]),
    CoachModule,
    TeamModule,
    TournamentApplicationModule,
    HostedTournamentCoreModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    UserRepository,
    AccountIdentityService,
    DiscordNameSyncService,
    UserSignInRepository,
    AccountFootprintService,
  ],
  exports: [
    UserService,
    UserRepository,
    AccountIdentityService,
    UserSignInRepository,
    AccountFootprintService,
  ],
})
export class UserModule {}
