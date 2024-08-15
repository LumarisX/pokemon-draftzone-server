import express, { Request, Response } from "express";
import { Ruleset, Rulesets } from "../data/rulesets";
import { filterNames } from "../services/data-services/pokedex.service";
import { getFormats, getRulesets } from "../services/ruleset.service";

export const dataRouter = express.Router();

type DataResponse = Response & { ruleset?: Ruleset };

dataRouter.get("/formats", (req: Request, res: Response) => {
  try {
    res.json(getFormats());
  } catch (error) {
    console.error("Error in /formats/ route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R1-01" });
  }
});

dataRouter.get("/rulesets", (req: Request, res: Response) => {
  try {
    res.json(getRulesets());
  } catch (error) {
    console.error("Error in /rulesets/ route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R2-01" });
  }
});

dataRouter.route("/search").get(async (req: Request, res: DataResponse) => {
  try {
    let ruleset = req.query.ruleset;
    let query = req.query.query;
    if (typeof ruleset == "string" && typeof query == "string") {
      if (!(ruleset in Rulesets)) {
        ruleset = "Gen9 NatDex";
      }
      res.json(filterNames(Rulesets[ruleset], query));
    } else {
      res.status(400).json({ error: "Ruleset type error", code: "DT-R3-01" });
    }
  } catch (error) {
    console.error("Error in /search route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R3-02" });
  }
});
