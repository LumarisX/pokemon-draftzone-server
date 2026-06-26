import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { DataService } from "./data.service";
import { PokemonDataDto } from "./pokemon-data.dto";

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

  @Get("random")
  async getRandom(
    @Query("count") count: string,
    @Query("ruleset") rulesetId?: string,
    @Query("format") formatId?: string,
    @Query("tier") tier?: string,
    @Query("banned") banned?: string | string[],
  ) {
    if (!rulesetId)
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "ruleset",
      });
    if (!formatId)
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "format",
      });

    const parsedCount = Math.min(Math.max(Number(count) || 1, 1), 50);
    const bannedList = Array.isArray(banned) ? banned : banned ? [banned] : [];

    return this.dataService.getRandomPokemon(rulesetId, parsedCount, formatId, {
      tier,
      banned: bannedList,
    });
  }

  @Get("pokemon/:pokemonId/learnset")
  async getPokemonMoves(
    @Param("pokemonId") pokemonId: string,
    @Query("ruleset") rulesetId?: string,
  ) {
    if (!rulesetId)
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "ruleset",
      });

    return this.dataService.getPokemonMoves(rulesetId, pokemonId);
  }

  @Get("pokemon/:pokemonId/formes")
  async getFormes(
    @Param("pokemonId") pokemonId: string,
    @Query("ruleset") rulesetId?: string,
  ) {
    if (!rulesetId)
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "ruleset",
      });

    return this.dataService.getPokemonFormes(rulesetId, pokemonId);
  }
}
