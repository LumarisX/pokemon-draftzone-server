import { toID } from "@pkmn/data";
import express, { Request, Response } from "express";
import { Rulesets } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";
import { summary } from "../services/matchup-services/summary.service";
import { typechart } from "../services/matchup-services/typechart.service";
import { movechart } from "../services/matchup-services/movechart.service";

export const plannerRouter = express.Router();

plannerRouter.route("/").get(async (req: Request, res: Response) => {
  try {
    let team: PokemonData[] = [];
    let ruleset = Rulesets["Gen9 NatDex"];
    if (
      req.query.ruleset &&
      typeof req.query.ruleset == "string" &&
      req.query.ruleset in Rulesets
    ) {
      ruleset = Rulesets[req.query.ruleset];
    }
    if (req.query && req.query.team && typeof req.query.team == "string") {
      for (let pid of req.query.team.split(",")) {
        team.push({ pid: toID(pid), name: pid });
      }
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
