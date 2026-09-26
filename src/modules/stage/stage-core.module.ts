import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StageRepository } from "./stage.repository";
import { StageEntity, StageSchema } from "./stage.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StageEntity.name, schema: StageSchema },
    ]),
  ],
  providers: [StageRepository],
  exports: [StageRepository],
})
export class StageCoreModule {}
