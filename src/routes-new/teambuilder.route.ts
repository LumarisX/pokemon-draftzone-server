import { toID } from "@pkmn/data";
import { Pokemon } from "@smogon/calc";
import fs from "fs";
import { z } from "zod";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { PikalyticData, testSet } from "../services/pats-services/test-set";
import { createRoute } from "./route-builder";

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
