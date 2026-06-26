import { Module } from "@nestjs/common";
import { TeambuilderController } from "./teambuilder.controller";
import { TeambuilderGateway } from "./teambuilder.gateway";
import { TeambuilderService } from "./teambuilder.service";

@Module({
  controllers: [TeambuilderController],
  providers: [TeambuilderService, TeambuilderGateway],
})
export class TeambuilderModule {}
