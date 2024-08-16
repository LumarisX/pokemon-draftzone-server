import express, { Request, Response } from "express";
import { DraftSpecies } from "../classes/pokemon";
import { movechart } from "../services/matchup-services/movechart.service";
import { summary } from "../services/matchup-services/summary.service";
import { typechart } from "../services/matchup-services/typechart.service";
import { getRuleset } from "../data/rulesets";

export const plannerRouter = express.Router();
1;
plannerRouter.route("/").get(async (req: Request, res: Response) => {
  try {
    let team: DraftSpecies[] = [];
    let ruleset = getRuleset(
      typeof req.query.ruleset === "string" ? req.query.ruleset : ""
    );
    if (req.query && req.query.team && typeof req.query.team == "string") {
      team = req.query.team.split(",").map((id: string) => {
        let specie = ruleset.gen.species.get(id);
        if (!specie) throw new Error(`${id} is an unknown id.`);
        let draftSpecies: DraftSpecies = new DraftSpecies(specie, {}, ruleset);
        return draftSpecies;
      });
      res.json({
        typechart: typechart(team),
        summary: summary(team),
        movechart: await movechart(team),
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: (error as Error).message });
  }
});
