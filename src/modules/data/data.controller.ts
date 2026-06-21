import { Controller, Get, Query } from "@nestjs/common";
import { DataService } from "./data.service";
import { PokemonDataDto } from "./dto/pokemon-data.dto";

@Controller("data")
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get("formats")
  async getFormats() {
    return this.dataService.getFormats();
  }

  @Get("formats/legacy")
  async getFormatsLegacy() {
    return this.dataService.getFormatsLegacy();
  }

  @Get("rulesets")
  async getRulesets() {
    return this.dataService.getRulesets();
  }

  @Get("rulesets/legacy")
  async getRulesetsLegacy() {
    return this.dataService.getRulesetsLegacy();
  }

  @Get("pokemon")
  async getPokemonList(
    @Query("ruleset") rulesetId: string,
  ): Promise<PokemonDataDto[]> {
    return this.dataService.getPokemonList(rulesetId);
  }
}
