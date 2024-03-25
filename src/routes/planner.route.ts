import express, { Request, Response } from "express";
import { typechart } from "../services/matchup-services/typechart.service";
import { summary } from "../services/matchup-services/summary.service";
import { Rulesets } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";

export const plannerRouter = express.Router();

plannerRouter.route("/").get(async (req: Request, res: Response) => {
  try {
    let team: PokemonData[] = [];
    let ruleset = Rulesets["NatDex gen 9"];
    // if (req.query && req.query.team) {
    // //   for (let pid of req.query.team.split(",")) {
    // //     team.push({ pid: pid, name: pid });
    // //   }
    //   res.json({
    //     typechart: typechart(ruleset, team),
    //     summary: summary(ruleset, team),
    //   });
    // }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: (error as Error).message });
  }
});
