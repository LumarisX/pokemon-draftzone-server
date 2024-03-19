import { ObjectId } from "mongoose";
import { PokemonId } from "../public/data/pokedex";
import { FormatId } from "../public/data/formats";
import { RulesetId } from "../public/data/rulesets";
import { Pokemon, PokemonBuilder } from "./pokemon";
const DraftModel = require("../models/draftModel");

type DraftDoc = {
  leagueName: string;
  teamName: string;
  leagueId: string;
  format: FormatId;
  ruleset: RulesetId;
  score: {
    wins: number;
    loses: number;
    diff: string;
  };
  owner: ObjectId;
  team: Pokemon[];
};

export class Draft {
  constructor(
    formData: {
      leagueName: string;
      format: FormatId;
      teamName: string;
      ruleset: RulesetId;
      team: Pokemon[];
    },
    user_id: ObjectId
  ) {
    return new Promise((resolve, reject) => {
      let data: DraftDoc = {
        leagueName: formData.leagueName,
        teamName: formData.teamName,
        leagueId: formData.leagueName.toLowerCase().replace(/\W/gi, ""),
        format: formData.format,
        ruleset: formData.ruleset,
        score: {
          wins: 0,
          loses: 0,
          diff: "",
        },
        owner: user_id,
        team: [],
      };
      let errors = [];
      for (let pokemonData of formData.team) {
        let pokemon = new PokemonBuilder(pokemonData);
        if (pokemon.error) {
          errors.push(pokemon.error);
        } else {
          data.team.push(pokemon.data);
        }
      }
      if (errors.length > 0) {
        reject(errors);
      }
      const draftModel = new DraftModel(data);
      resolve(draftModel);
    });
  }
}
