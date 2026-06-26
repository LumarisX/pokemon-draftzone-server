import { CoachModule } from "@modules/coach/coach.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TeamController } from "./team.controller";
import { TeamEntity, TeamSchema } from "./team.schema";
import { TeamRepository } from "./team.repository";
import { TeamService } from "./team.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeamEntity.name, schema: TeamSchema },
    ]),
    CoachModule,
  ],
  controllers: [TeamController],
  providers: [TeamService, TeamRepository],
  exports: [TeamService, TeamRepository],
})
export class TeamModule {}
