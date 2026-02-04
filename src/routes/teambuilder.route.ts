import { Request, Response } from "express";
import { RouteOld } from ".";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import fs from "fs";
import { toID } from "@pkmn/data";
import { Pokemon } from "@smogon/calc";
import { PikalyticData, testSet } from "../services/pats-services/test-set";
import { createRoute } from "./route-builder";
import { z } from "zod";
import { PDZError } from "../errors/pdz-error";
import { ErrorCodes } from "../errors/error-codes";

export const TeambuilderRoutes: RouteOld = {
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
            fs.readFileSync("./src/services/pats-services/pats.json", "utf-8"),
          );
          return res.json(
            data.map((pokemon) => ({
              name: pokemon.name,
              id: toID(pokemon.name),
              percent: pokemon.percent,
            })),
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

export const TeambuilderRoute = createRoute()((r) => {
  r.path("pokemonData")((r) => {
    r.get.validate({
      query: (data) =>
        z
          .object({
            ruleset: z.string().min(1),
            id: z.string().min(1),
          })
          .parse(data),
    })(async (ctx) => {
      const { ruleset: rulesetId, id } = ctx.validatedQuery;
      const ruleset = getRuleset(rulesetId);
      const specie = ruleset.species.get(id);
      if (!specie) throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND);
      const draftSpecies = new DraftSpecie(specie, ruleset);
      return await draftSpecies.toTeambuilder();
    });
  });
  r.path("pats-list")((r) => {
    r.get(async () => {
      const data: PikalyticData[] = JSON.parse(
        fs.readFileSync("./src/services/pats-services/pats.json", "utf-8"),
      );
      return data.map((pokemon) => ({
        name: pokemon.name,
        id: toID(pokemon.name),
        percent: pokemon.percent,
      }));
    });
  });
  r.path("pats-matchup")((r) => {
    r.get.validate({
      query: (data) =>
        z
          .object({
            set: z.string().min(1),
            opp: z.string().min(1),
          })
          .parse(data),
    })(async (ctx) => {
      const { set, opp } = ctx.validatedQuery;
      const pokemonData = JSON.parse(atob(set));
      const pokemon = new Pokemon(9, pokemonData.name, pokemonData);
      return testSet(pokemon, opp);
    });
  });
});
