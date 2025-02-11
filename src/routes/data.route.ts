import { Request, Response } from "express";
import { Route } from ".";
import { _getFormats, getFormats } from "../data/formats";
import {
  getRuleset,
  getRulesets,
  getRulesetsGrouped,
  Ruleset,
} from "../data/rulesets";
import { getRandom } from "../services/data-services/pokedex.service";
import { searchPokemon } from "../services/search.service";

type DataResponse = Response & { ruleset?: Ruleset };

export const DataRoutes: Route = {
  subpaths: {
    "/formats": {
      get: (req: Request, res: Response) => {
        try {
          res.json(getFormats());
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R1-01" });
        }
      },
    },
    "/formatsgrouped": {
      get: (req: Request, res: Response) => {
        try {
          res.json(_getFormats());
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R1-01" });
        }
      },
    },
    "/rulesets": {
      get: (req: Request, res: Response) => {
        try {
          res.json(getRulesets());
        } catch (error) {
          console.error("Error in /rulesets/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R2-01" });
        }
      },
    },
    "/rulesetsgrouped": {
      get: (req: Request, res: Response) => {
        try {
          res.json(getRulesetsGrouped());
        } catch (error) {
          console.error("Error in /rulesets/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R2-01" });
        }
      },
    },
    "/advancesearch": {
      get: async (req: Request, res: DataResponse) => {
        try {
          let ruleset = req.query.ruleset;
          let query = req.query.query;
          if (typeof query == "string") {
            query = decodeURIComponent(query);
            if (typeof ruleset === "string")
              res.json(await searchPokemon(query, ruleset));
            else res.json(await searchPokemon(query));
          } else {
            res
              .status(400)
              .json({ error: "Query type error", code: "DT-R3-01" });
          }
        } catch (error) {
          console.error(
            `Error in /search route:", ${
              (error as Error).message
            }\nSearch query: ${req.query.query}`
          );
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R3-02" });
        }
      },
    },
    "/listpokemon": {
      get: async (req: Request, res: DataResponse) => {
        // try {
        const rulesetId = req.query.ruleset;
        if (typeof rulesetId === "string") {
          const ruleset = getRuleset(rulesetId);
          return res.json(
            Array.from(ruleset.species)
              .sort((a, b) => a.num - b.num)
              .map((specie) => ({
                name: specie.name,
                id: specie.id,
              }))
          );
        }

        return res
          .status(400)
          .json({ error: "Query type error", code: "DT-R3-01" });
        // } catch (error) {
        //   console.error(
        //     `Error in /listpokemon route:", ${
        //       (error as Error).message
        //     }\nSearch query: ${req.query.query}`
        //   );
        //   res
        //     .status(500)
        //     .json({ error: "Internal Server Error", code: "DT-R3-02" });
        // }
      },
    },
    "/random": {
      get: async (req: Request, res: DataResponse) => {
        try {
          let rulesetId = req.query.ruleset;
          if (
            typeof req.query.count == "string" ||
            typeof req.query.count == "number"
          ) {
            const count = +req.query.count;
            if (typeof rulesetId === "string" && count > 0 && count <= 20) {
              const ruleset = getRuleset(rulesetId);
              const randomMons = getRandom(count, ruleset);
              return res.json(
                randomMons.map((pokemon) => ({
                  id: pokemon.id,
                  name: pokemon.name,
                }))
              );
            }
          }
          return res
            .status(400)
            .json({ error: "Query type error", code: "DT-R3-01" });
        } catch (error) {
          console.error(
            `Error in /random route:", ${
              (error as Error).message
            }\nRandom query: ${req.query.query}`
          );
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R3-02" });
        }
      },
    },
  },
};
