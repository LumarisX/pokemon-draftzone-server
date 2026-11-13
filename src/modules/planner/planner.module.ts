import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PlannerPlansController } from "./planner-plans.controller";
import { PlannerPlansRepository } from "./planner-plans.repository";
import {
  PlannerPlansEntity,
  PlannerPlansSchema,
} from "./planner-plans.schema";
import { PlannerPlansService } from "./planner-plans.service";
import { PlannerController } from "./planner.controller";
import { PlannerService } from "./planner.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlannerPlansEntity.name, schema: PlannerPlansSchema },
    ]),
    HostedTournamentCoreModule,
  ],
  controllers: [PlannerPlansController, PlannerController],
  providers: [PlannerService, PlannerPlansService, PlannerPlansRepository],
  exports: [PlannerService],
})
export class PlannerModule {}
