import { Request, Response } from "express";
import { Router } from "express";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { plannerCoverage } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";

export const PlannerRoute = Router();

PlannerRoute.get("/", async (req: Request, res: Response) => {
  try {
    const rulesetId = req.query.ruleset;
    const teamQuery = req.query.team;

    if (typeof rulesetId !== "string" || typeof teamQuery !== "string") {
      return res
        .status(400)
        .json({ message: "Query type error", code: "PL-R1-01" });
    }

    const ruleset = getRuleset(rulesetId);
    const team: DraftSpecie[] = teamQuery.split(",").map((id: string) => {
      const specie = ruleset.dex.species.get(id);
      if (!specie) throw new Error(`${id} is an unknown id.`);
      return new DraftSpecie(specie, ruleset);
    });

    const typechart = new Typechart(team);
    const summary = new SummaryClass(team);

    res.json({
      typechart: typechart.toJson(),
      recommended: typechart.recommended(),
      summary: summary.toJson(),
      movechart: await movechart(team, ruleset),
      coverage: await plannerCoverage(team),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: (error as Error).message });
  }
});
