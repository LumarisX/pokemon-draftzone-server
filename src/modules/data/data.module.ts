import { Module } from "@nestjs/common";
import { DataController } from "./data.controller";
import { DataService } from "./data.service";
import { StaticDataRepository } from "./infrastructure/static-data.repository";
import { RulesetQueryRepository } from "./ports/ruleset-query.repository";

@Module({
  imports: [],
  controllers: [DataController],
  providers: [
    DataService,
    {
      provide: RulesetQueryRepository,
      useClass: StaticDataRepository,
    },
  ],
  exports: [DataService],
})
export class DataModule {}
