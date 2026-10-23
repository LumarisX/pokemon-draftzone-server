import { TeamModule } from "@modules/team/team.module";
import { TournamentLogCoreModule } from "@modules/tournament-log/tournament-log-core.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import {
  HostedTournamentEntity,
  HostedTournamentSchema,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { UserModule } from "@modules/user/user.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ImportAliasRepository } from "./import/import-alias.repository";
import { ImportAliasEntity, ImportAliasSchema } from "./import/import-alias.schema";
import { TierListImportService } from "./import/tier-list-import.service";
import { TierListAccessService } from "./tier-list-access.service";
import { TierListHistoryService } from "./tier-list-history.service";
import { TierListInviteRepository } from "./tier-list-invite.repository";
import {
  TierListInviteEntity,
  TierListInviteSchema,
} from "./tier-list-invite.schema";
import { TierListRevisionRepository } from "./tier-list-revision.repository";
import {
  TierListRevisionEntity,
  TierListRevisionSchema,
} from "./tier-list-revision.schema";
import { TierListSharingService } from "./tier-list-sharing.service";
import { TierListController } from "./tier-list.controller";
import { TierListRepository } from "./tier-list.repository";
import { TierListEntity, TierListSchema } from "./tier-list.schema";
import { TierListService } from "./tier-list.service";
import { TournamentTierListController } from "./tournament-tier-list.controller";
import { TournamentTierListService } from "./tournament-tier-list.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TierListEntity.name, schema: TierListSchema },
      { name: TierListRevisionEntity.name, schema: TierListRevisionSchema },
      { name: TierListInviteEntity.name, schema: TierListInviteSchema },
      { name: ImportAliasEntity.name, schema: ImportAliasSchema },
      { name: HostedTournamentEntity.name, schema: HostedTournamentSchema },
    ]),
    HostedTournamentCoreModule,
    TeamModule,
    TournamentLogCoreModule,
    UserModule,
  ],
  controllers: [TierListController, TournamentTierListController],
  providers: [
    TierListService,
    TierListRepository,
    TierListRevisionRepository,
    TierListInviteRepository,
    ImportAliasRepository,
    TierListAccessService,
    TierListHistoryService,
    TierListSharingService,
    TierListImportService,
    TournamentTierListService,
  ],
  exports: [TierListRepository, TierListAccessService, TierListHistoryService],
})
export class TierListModule {}
