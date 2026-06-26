import { Controller, Get, Query } from "@nestjs/common";
import { PlannerService } from "./planner.service";
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
  async getPlanner(
    @Query("ruleset") rulesetId: string,
    @Query("team") teamString: string,
  ) {
    const ruleset = getRuleset(rulesetId);
    const team = teamString
      .split(",")
      .map((id: string) => new PDZPokemon(id as ID, ruleset));
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
