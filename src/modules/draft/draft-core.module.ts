import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { TeamModule } from "@modules/team/team.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DraftEntity, DraftSchema } from "./draft.schema";
import { DraftRepository } from "./draft.repository";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DraftEntity.name, schema: DraftSchema },
    ]),
    TeamModule,
    HostedTournamentCoreModule,
    TierListModule,
  ],
  providers: [DraftRepository],
  exports: [DraftRepository],
})
export class DraftCoreModule {}
