const matchupModel = require("../models/matchupModel");
const Pokemon = require("./pokemon");
const mongoose = require("mongoose");

class Matchup {
  constructor(formData, aTeamId) {
    return new Promise((resolve, reject) => {
      let data = {};
      data.aTeam = {
        _id: new mongoose.Types.ObjectId(aTeamId),
      };
      data.bTeam = {};
      data.bTeam.teamName = formData.teamName;
      data.stage = formData.stage;
      data.bTeam.team = [];
      let errors = [];
      for (let pokemonData of formData.team) {
        let pokemon = new Pokemon(pokemonData);
        if (pokemon.error) {
          errors.push(pokemon.error);
        } else {
          data.bTeam.team.push(pokemon.data);
        }
      }
      if (errors.length > 0) {
        reject(errors);
      }

      const model = new matchupModel(data);
      resolve(model);
    });
  }
}

module.exports = Matchup;
