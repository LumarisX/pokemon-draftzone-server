import { Request, Response } from "express";
import { Route } from ".";
import { getFormats } from "../data/formats";
import { getRuleset, getRulesets, Ruleset } from "../data/rulesets";
import { searchPokemon } from "../services/search.service";
import { getRandom } from "../services/data-services/pokedex.service";

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
    // "/search": {
    //   get: async (req: Request, res: DataResponse) => {
    //     try {
    //       let ruleset = req.query.ruleset;
    //       let query = req.query.query;
    //       if (typeof ruleset == "string" && typeof query == "string") {
    //         res.json(filterNames(getRuleset(ruleset), query));
    //       } else {
    //         res
    //           .status(400)
    //           .json({ error: "Ruleset type error", code: "DT-R3-01" });
    //       }
    //     } catch (error) {
    //       console.error("Error in /search route:", error);
    //       res
    //         .status(500)
    //         .json({ error: "Internal Server Error", code: "DT-R3-02" });
    //     }
    //   },
    // },
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
              const randomMons = [];
              const ruleset = getRuleset(rulesetId);
              for (let i = 0; i < count; i++) {
                randomMons.push(getRandom(ruleset.gen));
              }
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
  },
};
