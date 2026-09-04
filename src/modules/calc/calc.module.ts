import { Module } from "@nestjs/common";
import { CalcController } from "./calc.controller";
import { CalcService } from "./calc.service";

@Module({
  controllers: [CalcController],
  providers: [CalcService],
})
export class CalcModule {}
