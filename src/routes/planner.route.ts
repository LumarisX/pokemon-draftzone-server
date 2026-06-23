import { ID } from "@pkmn/data";
import z from "zod";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { plannerCoverage } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { createRoute } from "./route-builder";

export const PlannerRoute = createRoute()((r) => {
  r.get.validate({
    query: (data) =>
      z
        .object({
          ruleset: z.string().min(1),
          team: z.string(),
        })
        .parse(data),
  })(async (ctx) => {
    const ruleset = getRuleset(ctx.validatedQuery.ruleset);
    const team = ctx.validatedQuery.team
      .split(",")
      .map((id: string) => new DraftSpecie(id as ID, ruleset));
    const typechart = new Typechart(team);
    const summary = new SummaryClass(team);
    return {
      typechart: typechart.toJson(),
      recommended: typechart.recommended(),
      summary: summary.toJson(),
      movechart: await movechart(team, ruleset),
      coverage: await plannerCoverage(team),
    };
  });
});
