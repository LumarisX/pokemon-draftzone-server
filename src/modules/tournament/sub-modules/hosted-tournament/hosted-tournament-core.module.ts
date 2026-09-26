import { CoachModule } from "@modules/coach/coach.module";
import { LeagueCoreModule } from "@modules/league/league-core.module";
import { StageCoreModule } from "@modules/stage/stage-core.module";
import { TeamModule } from "@modules/team/team.module";
import {
  TierListEntity,
  TierListSchema,
} from "@modules/tier-list/tier-list.schema";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  HostedTournamentEntity,
  HostedTournamentSchema,
} from "./hosted-tournament.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HostedTournamentEntity.name, schema: HostedTournamentSchema },
      { name: TierListEntity.name, schema: TierListSchema },
    ]),
    LeagueCoreModule,
    StageCoreModule,
    CoachModule,
    TeamModule,
  ],
  providers: [HostedTournamentRepository],
  exports: [HostedTournamentRepository],
})
export class HostedTournamentCoreModule {}
