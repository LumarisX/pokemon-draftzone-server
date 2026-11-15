import { Controller, Get, Query } from "@nestjs/common";
import { PlannerService } from "./planner.service";
import { PlannerQueryDto } from "./planner-query.dto";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { ID } from "@pkmn/data";
import { getTeamTypechart } from "@modules/matchup/domain/typechart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { getTeamMoves } from "@modules/matchup/domain/movechart";
import { getTeamCoverage } from "@modules/matchup/domain/coverage";

@Controller("planner")
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get()
  async getPlanner(@Query() query: PlannerQueryDto) {
    const ids = query.team
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (ids.length < 1 || ids.length > 20) {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "A plan needs between 1 and 20 Pokémon.",
      });
    }
    const ruleset = getRuleset(query.ruleset);
    const team = ids.map((id) => new PDZPokemon(id as ID, ruleset));
    const summary = summarizeTeam(team);
    return {
      typechart: getTeamTypechart(team),
      recommended: [],
      summary: summary,
      movechart: await getTeamMoves(team),
      coverage: await getTeamCoverage(team),
    };
  }
}
