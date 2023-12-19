const express = require('express');
const router = express.Router();
const Draft = require("../models/draftModel");
const summeryService = require('../services/summery-service')
const speedtierService = require('../services/speedtier-service')
const TypechartService = require('../services/typechart-service')
const CoverageService = require('../services/coverage-service')
const MovechartService = require('../services/movechart-service')

router.get('/:draft_id/:opp_id/summery', async (req, res) => {
    try {
      res.json(summeryService.summery(res.myTeam, res.oppTeam))
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  
  router.get('/:draft_id/:opp_id/typechart', async (req, res) => {
    try {
      res.json({aTeam: TypechartService.typechart(res.myTeam), bTeam: TypechartService.typechart(res.oppTeam)})
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  
  router.get('/:draft_id/:opp_id/speedchart', async (req, res) => {
    try {
      res.json({
        aTeam: speedtierService.speedTierChart(res.myTeam), 
        bTeam: speedtierService.speedTierChart(res.oppTeam)
      })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  
  router.get('/:draft_id/:opp_id/coveragechart', async (req, res) => {
    try {
      res.json({
        aTeam: CoverageService.chart(res.myTeam),
        bTeam: CoverageService.chart(res.oppTeam)
      })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  
  router.get('/:draft_id/:opp_id/movechart', async (req, res) => {
    try {
      res.json({
        aTeam: MovechartService.chart(res.myTeam),
        bTeam: MovechartService.chart(res.myTeam)
      })
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