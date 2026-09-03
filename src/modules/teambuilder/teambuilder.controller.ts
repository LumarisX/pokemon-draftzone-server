import { Controller, Get, Param, Query } from "@nestjs/common";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { TypeName } from "@pkmn/data";
import { TeambuilderService } from "./teambuilder.service";

function required(value: string | undefined, field: string): string {
  if (!value) {
    throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, { field });
  }
  return value;
}

@Controller("teambuilder")
export class TeambuilderController {
  constructor(private readonly teambuilderService: TeambuilderService) {}

  @Get("species/:id")
  async getSpecies(
    @Param("id") id: string,
    @Query("ruleset") rulesetId?: string,
  ) {
    return this.teambuilderService.getSpecies(
      required(id, "id"),
      required(rulesetId, "ruleset"),
    );
  }

  @Get("species/:id/learnset")
  async getLearnset(
    @Param("id") id: string,
    @Query("ruleset") rulesetId?: string,
    @Query("types") types?: string,
    @Query("teraType") teraType?: string,
    @Query("ability") ability?: string,
  ) {
    return this.teambuilderService.getProcessedLearnset({
      ruleset: required(rulesetId, "ruleset"),
      pokemon: {
        id: required(id, "id") as Parameters<
          TeambuilderService["getProcessedLearnset"]
        >[0]["pokemon"]["id"],
        types: (types?.split(",").filter(Boolean) ?? []) as [string] | [string, string],
        teraType: teraType as TypeName,
        ability: ability ?? "",
        moves: [],
      },
    });
  }
}
