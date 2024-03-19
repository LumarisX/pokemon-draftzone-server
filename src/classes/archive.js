const ArchiveModel = require("../models/archiveModel");
const draftService = require("../../.old/draft-service");

class Archive {
  constructor(draft) {
    return new Promise((resolve, reject) => {
      let data = {};
      data.leagueName = draft.leagueName;
      data.format = draft.format;
      data.teamName = draft.teamName;
      data.ruleset = draft.ruleset;
      data.owner = draft.owner;
      data.team = [];
      data.matches = [];
      let errors = [];
      for (let pokemon of draft.team) {
        data.team.push(pokemon.pid);
      }
      draftService.getMatchups(draft._id).then((matchups) => {
        for (let matchup of matchups) {
          data.matches.push({
            stage: matchup.stage,
            replay: matchup.replay,
            teamName: matchup.bTeam.teamName,
            aTeam: {
              score: matchup.aTeam.score,
              paste: matchup.aTeam.paste,
              stats: matchup.aTeam.stats,
            },
            bTeam: {
              score: matchup.bTeam.score,
              paste: matchup.bTeam.paste,
              stats: matchup.bTeam.stats,
            },
          });
        }
        if (errors.length > 0) {
          reject(errors);
        }
        const archiveModel = new ArchiveModel(data);
        resolve(archiveModel);
      });
    });
  }
}

module.exports = Archive;
