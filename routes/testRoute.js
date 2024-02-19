const express = require('express');
const router = express.Router();
const ps = require("../services/pokedex-service");
const Pokedex = require("../public/data/pokedex")["BattlePokedex"]
const PokedexService = require('../services/pokedex-service')
const TypechartService = require('../services/matchup-services/typechart-service')
const Draft = require("../models/draftModel");
const Matchup = require("../models/matchupModel.js")
const { ObjectId } = require('mongodb')
const SpeedtierService = require('../services/matchup-services/speedtier-service')
const FilterService = require('../services/filter-service')
const CoverageService = require('../services/matchup-services/coverage-service')
const SummeryService = require('../services/matchup-services/summery-service')

router
  .route('/names')
  .get(async (req, res) => {
    res.json(pokedexNames())
  })

router
  .route('/search')
  .get(async (req, res) => {
    if(req.query && "q" in req.query){
      res.json(PokedexService.filterNames(req.query.q),)
    }
  })

router.get('/coverage', async (req, res) => {
  try {
    aTeam = await Draft.findById("65cbb6ea62c19728d4000000").lean()
    if (aTeam === null) {
      res.status(400).json({ message: "Draft ID not found" })
    }
    let gen = "9"
    res.json([
          CoverageService.chart(aTeam.team, aTeam.team, gen),
          CoverageService.chart(aTeam.team, aTeam.team, gen)
        ])
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/typechart', async (req, res) => {
  try {
    aTeam = await Draft.findById("65cbb6ea62c19728d4000000").lean()
    if (aTeam === null) {
      res.status(400).json({ message: "Draft ID not found" })
    }
    console.log(aTeam)
    res.json(TypechartService.typechart(aTeam.team))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})


function pokedexNames() {
  let out = []
  for (let p in Pokedex) {
    out.push({
      name: Pokedex[p].name,
      pid: p,
      fid: Pokedex[p].name.toLowerCase().replace(/[\W\s]+/g, ' ')
    })
  }
  return out
}

module.exports = router;