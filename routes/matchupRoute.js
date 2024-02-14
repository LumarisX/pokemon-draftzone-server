const express = require('express');
const router = express.Router();
const Draft = require("../models/draftModel");
const Matchup = require("../models/matchupModel.js")
const SummeryService = require('../services/matchup-services/summery-service')
const SpeedtierService = require('../services/matchup-services/speedtier-service')
const TypechartService = require('../services/matchup-services/typechart-service')
const CoverageService = require('../services/matchup-services/coverage-service')
const MovechartService = require('../services/matchup-services/movechart-service')
const Rulesets = require('../services/rulesets')
const { ObjectId } = require('mongodb')

router.route('/:matchup_id')
  .get(async (req, res) => {
    try {
      res.json(res.matchup)
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .delete(async (req, res) => {
    try {
      await res.rawMatchup.deleteOne()
      res.json({ message: "Matchup deleted" })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })

router.get('/:matchup_id/summery', async (req, res) => {
  try {
    res.json([SummeryService.summery(res.matchup.aTeam.team), SummeryService.summery(res.matchup.bTeam.team)])
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/:matchup_id/typechart', async (req, res) => {
  try {
    res.json([TypechartService.typechart(res.matchup.aTeam.team), TypechartService.typechart(res.matchup.bTeam.team)])
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/:matchup_id/speedchart', async (req, res) => {
  try {
    let level = Rulesets.Format[res.matchup.format].level
    res.json(SpeedtierService.speedTierChart([res.matchup.aTeam.team, level,res.matchup.bTeam.team], level))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/:matchup_id/coveragechart', async (req, res) => {
  try {
    let gen = Rulesets.Generation[res.matchup.ruleset].gen
    res.json([
      CoverageService.chart(res.matchup.aTeam.team, res.matchup.bTeam.team, gen),
      CoverageService.chart(res.matchup.bTeam.team, res.matchup.aTeam.team, gen)
    ])
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/:matchup_id/movechart', async (req, res) => {
  try {
    let gen = Rulesets.Generation[res.matchup.ruleset].gen
    res.json([
      MovechartService.chart(res.matchup.aTeam.team, gen),
      MovechartService.chart(res.matchup.bTeam.team, gen)
    ])
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.param("matchup_id", async (req, res, next, matchup_id) => {
  try {
    if (ObjectId.isValid(matchup_id)) {
      let rawMatchup = await Matchup.findById(matchup_id)
      if (rawMatchup === null) {
        res.status(400).json({ message: "Matchup ID not found" })
      }
      let matchup = rawMatchup
      aTeam = await Draft.findById(matchup.aTeam._id).lean()
      if (aTeam === null) {
        res.status(400).json({ message: "Draft ID not found" })
      }
      matchup.leagueName = aTeam.leagueName
      matchup.format = aTeam.format
      matchup.ruleset = aTeam.ruleset
      matchup.aTeam = {
        owner: aTeam.owner,
        team: aTeam.team,
        _id: aTeam._id
      }
      res.rawMatchup = rawMatchup
      res.matchup = matchup
    } else {
      return res.status(400).json({ message: 'Invalid ID format' })
    }

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

module.exports = router;