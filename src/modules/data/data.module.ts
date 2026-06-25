import { Module } from "@nestjs/common";
import { DataController } from "./data.controller";
import { DataService } from "./data.service";
import { DataRepository } from "./data.repository";

@Module({
  imports: [],
  controllers: [DataController],
  providers: [DataService, DataRepository],
  exports: [DataService],
})
export class DataModule {}
