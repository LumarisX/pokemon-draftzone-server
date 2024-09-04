import express, { Request, Response } from "express";
import { getRuleset, getRulesets, Ruleset } from "../data/rulesets";
import { filterNames } from "../services/data-services/pokedex.service";
import { getFormats } from "../data/formats";
import { searchPokemon } from "../services/search.service";

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
      res.json(filterNames(getRuleset(ruleset), query));
    } else {
      res.status(400).json({ error: "Ruleset type error", code: "DT-R3-01" });
    }
  } catch (error) {
    console.error("Error in /search route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R3-02" });
  }
});

dataRouter
  .route("/advancesearch")
  .get(async (req: Request, res: DataResponse) => {
    try {
      let ruleset = req.query.ruleset;
      let query = req.query.query;
      if (typeof query == "string") {
        query = decodeURIComponent(query);
        if (typeof ruleset === "string")
          res.json(await searchPokemon(query, ruleset));
        else res.json(await searchPokemon(query));
      } else {
        res.status(400).json({ error: "Query type error", code: "DT-R3-01" });
      }
    } catch (error) {
      console.error(
        `Error in /search route:", ${(error as Error).message}\nSearch query: ${
          req.query.query
        }`
      );
      res
        .status(500)
        .json({ error: "Internal Server Error", code: "DT-R3-02" });
    }
  });
