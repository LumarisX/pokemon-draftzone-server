import express, { Request, Response } from "express";
import { DraftSpecies } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { Routes } from ".";

export const plannerRouter = express.Router();

const PlannerRoutes: Routes = [
  {
    path: "/",
    get: async (req: Request, res: Response) => {
      try {
        let team: DraftSpecies[] = [];
        let ruleset = getRuleset(
          typeof req.query.ruleset === "string" ? req.query.ruleset : ""
        );
        if (req.query && req.query.team && typeof req.query.team == "string") {
          team = req.query.team.split(",").map((id: string) => {
            let specie = ruleset.gen.dex.species.get(id);
            if (!specie) throw new Error(`${id} is an unknown id.`);
            let draftSpecies: DraftSpecies = new DraftSpecies(
              specie,
              {},
              ruleset
            );
            return draftSpecies;
          });
          let typechart = new Typechart(team);
          let summary = new SummaryClass(team);
          summary.statistics();
          res.json({
            typechart: typechart.toJson(),
            recommended: typechart.recommended(),
            summary: summary.toJson(),
            movechart: await movechart(team),
          });
        }
      } catch (error) {
        console.log(error);
        res.status(500).json({ message: (error as Error).message });
      }
    },
  },
];

PlannerRoutes.forEach((entry) => {
  const route = plannerRouter.route(entry.path);
  if (entry.get) route.get(entry.get);
  if (entry.patch) route.patch(entry.patch);
  if (entry.post) route.post(entry.post);
  if (entry.delete) route.delete(entry.delete);
});
