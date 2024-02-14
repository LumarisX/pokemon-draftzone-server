const express = require('express');
const router = express.Router();
const UserModel = require("../models/userModel");
const MatchupModel = require("../models/matchupModel")
const DraftModel = require("../models/draftModel");
const Matchup = require("../classes/matchup")
const Draft = require("../classes/draft")
const DraftService = require("../services/draft-service")
const ObjectId = require('mongoose').Types.ObjectId;


router.route("/teams")
  .get(async (req, res) => {
    try {
      res.json(await DraftModel.find({ owner: req.sub }).sort({'updatedAt':1}));
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .post(async (req, res) => {
    try {
      let draft = new Draft(req.body, res.user._id)
      if (draft.valid) {
        await draft.model.save()
        res.status(201).json({ message: "Draft Added" })
      } else {
        return res.status(400).json({ message: draft.errors })
      }
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })

router.route("/:team_id")
  .get(async (req, res) => {
    try {
      res.team.score = await DraftService.getScore(res.team._id)
      res.json(res.team)
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })

router.route("/:team_id/matchups")
  .get(async (req, res) => {
    try {
      res.json(await MatchupModel.find({ 'aTeam._id': res.team._id }));
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .post(async (req, res) => {
    try {
      let matchup = new Matchup(req.body, res.team._id)
      if (matchup.valid) {
        await matchup.model.save()
        res.status(201).json({ message: "Matchup Added" })
      } else {
        return res.status(400).json({ message: matchup.errors })
      }
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  


router.get("/:team_id/:matchup_id", async (req, res) => {
  try {
    res.json(res.team.get("opponents")[req.params.opponent_id])
  } catch (error) {
    req.status(500).json({ message: error.message })
  }
})

router.route("/test")
  .get(async (req, res) => {
    try {
      console.log(req.sub)
      res.json(await DraftModel.find({ owner: req.sub }));
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })

// router.param("user_id", async (req, res, next, user_id) => {
//   let user;
//   try {
//     user = await UserModel.find({ username: user_id });
//     if (user.length === 0) {
//       return res.status(400).json({ message: 'User id not found' })
//     }
//     res.user = user[0];
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
//   next();
// });

router.param("team_id", async (req, res, next, team_id) => {
  let team;
  try {
    let user_id = await req.sub;
    if (ObjectId.isValid(team_id)) {
      team = await DraftModel.findById(team_id).lean();

    } else {
      team = await DraftModel.find({ owner: user_id, leagueId: team_id });
      team = team[0]
    }
    if (team == null) {
      return res.status(400).json({ message: 'Team id not found' })
    }
    res.team = team.toObject();
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
      return res.status(400).json({ message: 'Team id not found' })
    }
    res.matchup = matchup
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

module.exports = router;