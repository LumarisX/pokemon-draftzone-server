import { Request, Response } from "express";
import { Route } from ".";
import { DraftSpecies } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";

export const TeambuilderRoutes: Route = {
  subpaths: {
    "/pokemonData": {
      get: async (req: Request, res: Response) => {
        try {
          let rulesetId = req.query.ruleset;
          let id = req.query.id;
          if (typeof rulesetId === "string" && typeof id === "string") {
            const ruleset = getRuleset(rulesetId);
            const specie = ruleset.gen.species.get(id);
            if (specie) {
              const draftSpecies = new DraftSpecies(specie, {}, ruleset);
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
  },
};
