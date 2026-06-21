import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CoachController } from "./coach.controller";
import { CoachEntity, CoachSchema } from "./coach.schema";
import { CoachRepository } from "./coach.repository";
import { CoachService } from "./coach.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CoachEntity.name, schema: CoachSchema },
    ]),
  ],
  controllers: [CoachController],
  providers: [CoachService, CoachRepository],
  exports: [CoachService, CoachRepository],
})
export class CoachModule {}
