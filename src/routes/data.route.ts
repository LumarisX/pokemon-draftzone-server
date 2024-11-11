import { Request, Response } from "express";
import { Route } from ".";
import { getFormats } from "../data/formats";
import { DEFAULT, getRuleset, getRulesets, Ruleset } from "../data/rulesets";
import { searchPokemon } from "../services/search.service";
import { spec } from "node:test/reporters";

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
    "/listpokemon": {
      get: async (req: Request, res: Response) => {
        try {
          // let ruleset: Ruleset = getRuleset(
          //   typeof req.query.ruleset === "string" ? req.query.ruleset : DEFAULT
          // );
          // const species: {
          //   [key: string]: {
          //     base: { id: string; name: string };
          //     formes: { id: string; name: string }[];
          //   };
          // } = {};
          // for (let specie of ruleset.gen.species) {
          //   let base: string | null = null;
          // for (let specie2 of ruleset.gen.species) {
          //   if (specie2.id === specie.id) continue;
          //   if (
          //     // specie2.otherFormes?.includes(specie.name) ||
          //     specie.changesFrom === specie2.name
          //     // specie.baseSpecies === specie2.name
          //   ) {
          //     base = specie2.id;
          //     break;
          //   }
          // }
          //   if (base) {
          //     if (!(base in species)) {
          //       species[base] = { base: { id: base, name: "" }, formes: [] };
          //     }
          //     species[base].formes.push({ id: specie.id, name: specie.name });
          //   } else {
          //     if (species[specie.id]) {
          //       species[specie.id].base = { id: specie.id, name: specie.name };
          //     } else {
          //       species[specie.id] = {
          //         base: { id: specie.id, name: specie.name },
          //         formes: [],
          //       };
          //     }
          //   }
          // }
          // res.json({
          //   species: Object.values(species).sort((x, y) =>
          //     x.base.id.localeCompare(y.base.id)
          //   ),
          //   ruleset: ruleset,
          // });

          let ruleset: Ruleset = getRuleset(
            typeof req.query.ruleset === "string" ? req.query.ruleset : DEFAULT
          );
          const species: { id: string; name: string; num: number }[] = [];
          for (let specie of ruleset.gen.species) {
            species.push({ id: specie.id, name: specie.name, num: specie.num });
          }
          res.json({
            species: species
              .sort((x, y) => x.num - y.num)
              .map((e) => ({ id: e.id, name: e.name })),
            ruleset: ruleset,
          });
        } catch (error) {}
      },
    },
    "/advancesearch": {
      get: async (req: Request, res: Response & { ruleset?: Ruleset }) => {
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
  },
};
