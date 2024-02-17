const express = require('express');
const router = express.Router();
const Draft = require("../models/draftModel");
const Matchup = require("../models/matchupModel.js")
const SummeryService = require('../services/matchup-services/summery-service')
const SpeedtierService = require('../services/matchup-services/speedtier-service')
const TypechartService = require('../services/matchup-services/typechart-service')
const CoverageService = require('../services/matchup-services/coverage-service')
const MovechartService = require('../services/matchup-services/movechart-service')
const Rulesets = require('../public/data/rulesets')
const { ObjectId } = require('mongodb')
const PokedexService = require('../services/pokedex-service')

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
    res.json([SummeryService.summery(res.matchup.aTeam), SummeryService.summery(res.matchup.bTeam)])
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
    let level = Rulesets.Formats[res.matchup.format].level
    res.json(SpeedtierService.speedTierChart([res.matchup.aTeam.team, level,res.matchup.bTeam.team], level))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/:matchup_id/coveragechart', async (req, res) => {
  try {
    let gen = Rulesets.Rulesets[res.matchup.ruleset].gen
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
    let gen = Rulesets.Rulesets[res.matchup.ruleset].gen
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
      let matchup = await Matchup.findById(matchup_id).lean()
      if (matchup === null) {
        res.status(400).json({ message: "Matchup ID not found" })
      }
      aTeam = await Draft.findById(matchup.aTeam._id).lean()
      for(let pokemon of aTeam.team){
        console.log(PokedexService)
        pokemon.name = PokedexService.getName(pokemon.pid)
      }
      if (aTeam === null) {
        res.status(400).json({ message: "Draft ID not found" })
      }
      matchup.leagueName = aTeam.leagueName
      matchup.format = aTeam.format
      matchup.ruleset = aTeam.ruleset
      matchup.aTeam = {
        owner: aTeam.owner,
        teamName: aTeam.teamName,
        team: aTeam.team,
        _id: aTeam._id
      }
      for(let pokemon of matchup.aTeam.team){
        console.log(pokemon)
        pokemon.name = PokedexService.getName(pokemon.pid)
      }
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