import mongoose, { ObjectId } from "mongoose";
import { PokemonId } from "../public/data/pokedex";
import { Pokemon, PokemonBuilder } from "./pokemon";
import { MatchupModel } from "../models/matchup.model";

type MatchupDoc = {
  aTeam: Side;
  bTeam: Side;
  stage: string;
  replay?: String;
};

export type Side = {
  _id?: ObjectId;
  teamName: string;
  team: Pokemon[];
  name?: string;
  stats: {
    [key in PokemonId]: {
      kills?: number;
      deaths?: number;
      indirect?: number;
      brought: number;
    };
  };
  score: number;
  paste?: String;
};

export class Matchup {
  constructor(
    formData: { teamName: string; stage: string; team: Pokemon[] },
    aTeamId: string
  ) {
    return new Promise((resolve, reject) => {
      let data: MatchupDoc = {
        aTeam: {
          _id: new mongoose.Types.ObjectId(aTeamId),
          teamName: "",
          team: [],
          name: undefined,
          stats: {},
          score: 0,
          paste: undefined,
        },
        bTeam: {
          teamName: formData.teamName,
          team: [],
          name: undefined,
          stats: {},
          score: 0,
          paste: undefined,
        },
        stage: formData.stage,
      };
      data.stage = formData.stage;
      let errors = [];
      for (let pokemonData of formData.team) {
        let pokemon = new PokemonBuilder(pokemonData);
        if (pokemon.error) {
          errors.push(pokemon.error);
        } else {
          data.bTeam.team.push(pokemon.data);
        }
      }
      if (errors.length > 0) {
        reject(errors);
      }

      const model = new MatchupModel(data);
      resolve(model);
    });
  }
}

class Score {
  constructor(scoreData) {
    return new Promise((resolve, reject) => {
      let data = {};
      data.aTeam = { stats: {} };
      data.bTeam = { stats: {} };
      const pastePattern = /^(https:\/\/)?pokepast\.es\/[a-zA-Z0-9]{16}$/;
      if (scoreData.aTeam.paste != null && scoreData.aTeam.paste != "") {
        // if (pastePattern.test(scoreData.aTeam.paste)) {
        data.aTeam.paste = scoreData.aTeam.paste;
        // } else {
        //   errors.push("Invalid paste format:", scoreData.aTeam.paste);
        // }
      }
      if (scoreData.bTeam.paste != null && scoreData.bTeam.paste != "") {
        // if (pastePattern.test(scoreData.bTeam.paste)) {
        data.bTeam.paste = scoreData.bTeam.paste;
        // } else {
        //   errors.push("Invalid paste format:", scoreData.bTeam.paste);
        // }
      }
      if (scoreData.replay != null && scoreData.replay != "") {
        data.replay = scoreData.replay;
      }
      data.aTeam.score = scoreData.aTeam.score;
      data.bTeam.score = scoreData.bTeam.score;
      for (let stat of scoreData.aTeam.team) {
        let pokemonStats = {};
        if (stat.kills != null && stat.kills > 0) {
          pokemonStats.kills = stat.kills;
        }
        if (stat.deaths != null && stat.deaths > 0) {
          pokemonStats.deaths = stat.deaths;
        }
        if (stat.indirect != null && stat.indirect > 0) {
          pokemonStats.indirect = stat.indirect;
        }
        if (stat.brought != null && stat.brought > 0) {
          pokemonStats.brought = stat.brought;
        }
        if (Object.keys(pokemonStats).length > 0) {
          data.aTeam.stats[stat.pokemon.pid] = pokemonStats;
        }
      }
      for (let stat of scoreData.bTeam.team) {
        let pokemonStats = {};
        if (stat.kills != null && stat.kills > 0) {
          pokemonStats.kills = stat.kills;
        }
        if (stat.deaths != null && stat.deaths > 0) {
          pokemonStats.deaths = stat.deaths;
        }
        if (stat.indirect != null && stat.indirect > 0) {
          pokemonStats.indirect = stat.indirect;
        }
        if (stat.brought != null && stat.brought > 0) {
          pokemonStats.brought = stat.brought;
        }
        if (Object.keys(pokemonStats).length > 0) {
          data.bTeam.stats[stat.pokemon.pid] = pokemonStats;
        }
      }
      resolve(data);
    });
  }
}

module.exports = { Matchup, Score };