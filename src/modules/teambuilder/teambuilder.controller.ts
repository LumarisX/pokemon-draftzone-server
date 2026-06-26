import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Controller, Get, Query } from "@nestjs/common";
import { TeambuilderService } from "./teambuilder.service";

@Controller("teambuilder")
export class TeambuilderController {
  constructor(private readonly teambuilderService: TeambuilderService) {}

  @Get("pokemonData")
  async getPokemonData(
    @Query("id") id?: string,
    @Query("ruleset") rulesetId?: string,
  ) {
    if (!id)
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "id",
      });
    if (!rulesetId)
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "ruleset",
      });

    return this.teambuilderService.getPokemonData(id, rulesetId);
  }
}
