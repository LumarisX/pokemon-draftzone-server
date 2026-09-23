import { CoachModule } from "@modules/coach/coach.module";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TeamEntity, TeamSchema } from "./team.schema";
import { TeamRepository } from "./team.repository";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeamEntity.name, schema: TeamSchema },
    ]),
    CoachModule,
  ],
  providers: [TeamRepository],
  exports: [TeamRepository],
})
export class TeamModule {}
