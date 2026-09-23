import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CoachEntity, CoachSchema } from "./coach.schema";
import { CoachRepository } from "./coach.repository";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CoachEntity.name, schema: CoachSchema },
    ]),
  ],
  providers: [CoachRepository],
  exports: [CoachRepository],
})
export class CoachModule {}
