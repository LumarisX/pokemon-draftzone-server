import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TeambuilderTeamController } from "./teambuilder-team.controller";
import { TeambuilderTeamRepository } from "./teambuilder-team.repository";
import {
  TeambuilderTeamEntity,
  TeambuilderTeamSchema,
} from "./teambuilder-team.schema";
import { TeambuilderTeamService } from "./teambuilder-team.service";
import { TeambuilderController } from "./teambuilder.controller";
import { TeambuilderService } from "./teambuilder.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeambuilderTeamEntity.name, schema: TeambuilderTeamSchema },
    ]),
  ],
  controllers: [TeambuilderTeamController, TeambuilderController],
  providers: [
    TeambuilderService,
    TeambuilderTeamService,
    TeambuilderTeamRepository,
  ],
})
export class TeambuilderModule {}
