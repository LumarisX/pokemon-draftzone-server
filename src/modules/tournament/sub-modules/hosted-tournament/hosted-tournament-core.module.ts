import { CoachModule } from "@modules/coach/coach.module";
import { LeagueCoreModule } from "@modules/league/league-core.module";
import { StageModule } from "@modules/stage/stage.module";
import { TeamModule } from "@modules/team/team.module";
import { forwardRef, Module } from "@nestjs/common";
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
    ]),
    LeagueCoreModule,
    forwardRef(() => StageModule),
    CoachModule,
    TeamModule,
  ],
  providers: [HostedTournamentRepository],
  exports: [HostedTournamentRepository],
})
export class HostedTournamentCoreModule {}
