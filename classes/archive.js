const ArchiveModel = require("../models/archiveModel");

class Archive {
  consArchive(draft) {
    return new Promise((resolve, reject) => {
      let data = {};
      data.leagueName = draft.leagueName;
      data.format = draft.format;
      data.teamName = draft.teamName;
      data.ruleset = draft.ruleset;
      data.owner = draft.owner;
      data.team = [];
      let errors = [];
      for (let pokemon of draft.team) {
        data.team.push(pokemon.pid)
      }
      if (errors.length > 0) {
        reject(errors);
      }
      const archiveModel = new ArchiveModel(data);
      resolve(archiveModel);
    });
  }
}

module.exports = Archive;
