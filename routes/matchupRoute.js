const express = require('express');
const router = express.Router();
const Draft = require("../models/draftModel");
const matchupService = require('../services/matchup-service')

router
  .route('/:draft_id/:opp_id')
  .get(async (req, res) => {
    try {
      res.json(matchupService.summery(res.myTeam,res.oppTeam));
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  
router.param("draft_id", async (req, res, next, draft_id) => {
  try {
    let draft = Draft.findById(draft_id).lean();
    if (draft == null) {
      return res.status(400).json({ message: 'Team id not found' })
    }
    res.draft = draft;
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

router.param("opp_id", async (req, res, next, opp_id) => {
  try {
    let draft = await res.draft;
    if (!(opp_id in draft["opponents"])) {
      return res.status(400).json({ message: 'Opponent id not found' })
    }
    res.myTeam = draft.team;
    res.oppTeam = draft["opponents"][opp_id]["team"];
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});


module.exports = router;