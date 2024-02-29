const express = require("express");
const router = express.Router();
const UserModel = require("../models/userModel");
const MatchupModel = require("../models/matchupModel");
const DraftModel = require("../models/draftModel");
const Matchup = require("../classes/matchup");
const Draft = require("../classes/draft");
const DraftService = require("../services/draft-service");
const ObjectId = require("mongoose").Types.ObjectId;
const PokedexService = require("../services/pokedex-service");

router
  .route("/teams")
  .get(async (req, res) => {
    try {
      res.json(
        await DraftModel.find({ owner: req.sub }).sort({ updatedAt: 1 })
      );
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .post(async (req, res) => {
    try {
      new Draft(req.body, req.sub)
        .then((draft) => {
          DraftModel.find({ owner: req.sub, leagueId: draft.leagueId }).then(
            (foundDrafts) => {
              console.log(foundDrafts);
              if (foundDrafts.length > 0) {
                console.log();
                res.status(400).json({ message: "Draft ID already exists" });
              } else {
                draft
                  .save()
                  .then(() => {
                    res.status(201).json({ message: "Draft Added" });
                  })
                  .catch((error) => {
                    console.error("Error saving draft:", error);
                    res.status(500).json({ message: "Internal Server Error" });
                  });
              }
            }
          );
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router
  .route("/:team_id")
  .get(async (req, res) => {
    try {
      res.draft.score = await DraftService.getScore(res.draft._id);
      res.json(res.draft);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .patch(async (req, res) => {
    try {
      let team_id = req.params.team_id;
      new Draft(req.body, req.sub)
        .then((draft) => {
          console.log({ owner: req.sub, leagueId: team_id });
          DraftModel.findOneAndUpdate(
            { owner: req.sub, leagueId: team_id },
            {
              teamName: draft.teamName,
              leagueName: draft.leagueName,
              team: draft.team,
              format: draft.format,
              ruleset: draft.ruleset,
            },
            { new: true, upsert: true }
          )
            .then((updatedDraft) => {
              if (updatedDraft) {
                res
                  .status(200)
                  .json({ message: "Draft Updated", draft: updatedDraft });
              } else {
                res.status(404).json({ message: "Draft not found" });
              }
            })
            .catch((error) => {
              console.error("Error updating draft:", error);
              res.status(500).json({ message: "Internal Server Error" });
            });
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router
  .route("/:team_id/matchups")
  .get(async (req, res) => {
    try {
      res.json(await MatchupModel.find({ "aTeam._id": res.draft._id }));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .post(async (req, res) => {
    try {
      new Matchup(req.body, res.draft._id)
        .then((matchup) => {
          matchup
            .save()
            .then(() => {
              res.status(201).json({ message: "Matchup Added" });
            })
            .catch((error) => {
              console.error("Error saving draft:", error);
              res.status(500).json({ message: "Internal Server Error" });
            });
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router
  .route("/:team_id/:matchup_id")
  .get(async (req, res) => {
    try {
      res.json(res.matchup);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .patch((req, res) => {
    try {
      new Matchup(req.body, res.draft._id)
        .then((matchup) => {
          MatchupModel.findByIdAndUpdate(
            req.params.matchup_id,
            {
              teamName: matchup.teamName,
              stage: matchup.stage,
              "bTeam.team": matchup.bTeam.team,
            },
            { new: true, upsert: true }
          )
            .then((updatedMatchup) => {
              if (updatedMatchup) {
                res
                  .status(200)
                  .json({ message: "Matchup Updated", draft: updatedMatchup });
              } else {
                res.status(404).json({ message: "Matchup not found" });
              }
            })
            .catch((error) => {
              console.error("Error updating matchup:", error);
              res.status(500).json({ message: "Internal Server Error" });
            });
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: error.message });
    }
  });

router.param("team_id", async (req, res, next, team_id) => {
  let draft;
  try {
    let user_id = await req.sub;
    if (ObjectId.isValid(team_id)) {
      draft = await DraftModel.findById(team_id).lean();
    } else {
      draft = await DraftModel.find({ owner: user_id, leagueId: team_id });
      draft = draft[0];
    }
    if (draft == null) {
      return res.status(400).json({ message: "Team id not found" });
    }
    res.draft = draft.toObject();
    for (let pokemon of res.draft.team) {
      pokemon.name = PokedexService.getName(pokemon.pid);
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

router.param("matchup_id", async (req, res, next, matchup_id) => {
  let matchup;
  try {
    matchup = await MatchupModel.findById(matchup_id);
    if (matchup_id == null) {
      return res.status(400).json({ message: "Team id not found" });
    }
    res.matchup = matchup;
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

module.exports = router;
