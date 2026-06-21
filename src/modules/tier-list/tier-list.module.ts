import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TierListEntity, TierListSchema } from "./tier-list.schema";
import { TierListController } from "./tier-list.controller";
import { TierListRepository } from "./tier-list.repository";
import { TierListService } from "./tier-list.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TierListEntity.name, schema: TierListSchema },
    ]),
  ],
  controllers: [TierListController],
  providers: [TierListService, TierListRepository],
  exports: [TierListRepository],
})
export class TierListModule {}
