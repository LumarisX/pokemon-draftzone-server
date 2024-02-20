const Pokemon = require('./pokemon')
const DraftModel = require("../models/draftModel");

class Draft {

  constructor(formData, user_id) {
    return new Promise((resolve, reject) => {
      let data = {}
      data.leagueName = formData.leagueName
      data.leagueId = formData.leagueName.toLowerCase().replace(/\W/gi,'')
      data.format = formData.format
      data.teamName = formData.teamName
      data.ruleset = formData.ruleset
      data.owner = user_id
      data.team = []

      DraftModel.findOne({ leagueId: data.leagueId, owner: user_id })
        .then(existingLeague => {
          if (existingLeague) {
            reject('League ID already exists. Please choose a different league name.');
          } else {
            let errors = []
            for (let pokemonData of formData.team) {
              let pokemon = new Pokemon(pokemonData);
              if (pokemon.error) {
                errors.push(pokemon.error)
              } else {
                data.team.push(pokemon.data);
              }
            }
            if(errors.length > 0){
              reject(errors)
            }
            const draftModel = new DraftModel(data);
            resolve(draftModel);
          }
        })
        .catch(error => {
          reject(error);
        });
    });
  }
}

module.exports = Draft 