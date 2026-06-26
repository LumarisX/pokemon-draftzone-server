import { Module } from "@nestjs/common";
import { PlannerController } from "./planner.controller";
import { PlannerService } from "./planner.service";

@Module({
  imports: [],
  controllers: [PlannerController],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
