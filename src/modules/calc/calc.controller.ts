import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { getRulesetsGrouped } from "@core/data/rulesets/rulesets";
import { CalcRequestDto, CalcResponseDto } from "./calc.dto";
import { CalcService } from "./calc.service";

@Controller("calc")
export class CalcController {
  constructor(private readonly calcService: CalcService) {}

  @Get("rulesets")
  rulesets() {
    return getRulesetsGrouped();
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  calculate(@Body() request: CalcRequestDto): CalcResponseDto {
    return this.calcService.calculate(request);
  }
}
