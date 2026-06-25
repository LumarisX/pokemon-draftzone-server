import { LeagueCoreModule } from "@modules/league/league-core.module";
import { StageModule } from "@modules/stage/stage.module";
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
  ],
  providers: [HostedTournamentRepository],
  exports: [HostedTournamentRepository],
})
export class HostedTournamentCoreModule {}
