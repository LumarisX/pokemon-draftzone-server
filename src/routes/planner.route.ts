import { ID } from "@pkmn/data";
import express, { Request, Response } from "express";
import { DraftSpecies } from "../classes/pokemon";
import { Rulesets } from "../data/rulesets";
import { movechart } from "../services/matchup-services/movechart.service";
import { summary } from "../services/matchup-services/summary.service";
import { typechart } from "../services/matchup-services/typechart.service";

export const plannerRouter = express.Router();
1;
plannerRouter.route("/").get(async (req: Request, res: Response) => {
  try {
    let team: DraftSpecies[] = [];
    let ruleset = Rulesets["Gen9 NatDex"];
    if (
      req.query.ruleset &&
      typeof req.query.ruleset == "string" &&
      req.query.ruleset in Rulesets
    ) {
      ruleset = Rulesets[req.query.ruleset];
    }
    if (req.query && req.query.team && typeof req.query.team == "string") {
      team = req.query.team.split(",").map((pid: string) => {
        let specie = ruleset.gen.species.get(pid);
        if (!specie) throw new Error(`${pid} is an unknown pid.`);
        let draftSpecies: DraftSpecies = new DraftSpecies(
          specie,
          {
            pid: pid as ID,
            name: pid,
          },
          ruleset
        );
        return draftSpecies;
      });
      res.json({
        typechart: typechart(ruleset, team),
        summary: summary(ruleset, team),
        movechart: await movechart(ruleset, team),
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: (error as Error).message });
  }
});
