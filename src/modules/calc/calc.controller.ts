import { Body, Controller, Get, Post } from "@nestjs/common";
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
  calculate(@Body() request: CalcRequestDto): CalcResponseDto {
    return this.calcService.calculate(request);
  }
}
