import { Request, Response } from "express";
import { Route } from ".";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import fs from "fs";
import { toID } from "@pkmn/data";
import { Pokemon } from "@smogon/calc";
import { PikalyticData, testSet } from "../services/pats-services/test-set";

export const TeambuilderRoutes: Route = {
  subpaths: {
    "/pokemonData": {
      get: async (req: Request, res: Response) => {
        try {
          let rulesetId = req.query.ruleset;
          let id = req.query.id;
          if (typeof rulesetId === "string" && typeof id === "string") {
            const ruleset = getRuleset(rulesetId);
            const specie = ruleset.species.get(id);
            if (specie) {
              const draftSpecies = new DraftSpecie(specie, ruleset);
              return res.json(await draftSpecies.toTeambuilder());
            }
          }
          return res
            .status(400)
            .json({ error: "General error", code: "TR-R1-02" });
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "TR-R1-01" });
        }
      },
    },
    "/pats-list": {
      get: async (req: Request, res: Response) => {
        try {
          const data: PikalyticData[] = JSON.parse(
            fs.readFileSync("./src/services/pats-services/pats.json", "utf-8")
          );
          return res.json(
            data.map((pokemon) => ({
              name: pokemon.name,
              id: toID(pokemon.name),
              percent: pokemon.percent,
            }))
          );
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "TR-R2-01" });
        }
      },
    },
    "/pats-matchup": {
      get: async (req: Request, res: Response) => {
        try {
          let { set, opp } = req.query;
          if (typeof set === "string" && typeof opp === "string") {
            let pokemonData = JSON.parse(atob(set));
            let pokemon = new Pokemon(9, pokemonData.name, pokemonData);
            return res.json(testSet(pokemon, opp));
          }
          return res
            .status(400)
            .json({ error: "Internal Server Error", code: "TR-R3-02" });
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "TR-R3-01" });
        }
      },
    },
  },
};
