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

router
  .route('/names')
  .get(async (req, res) => {
    res.json(pokedexNames())
  })

router
  .route('/search')
  .get(async (req, res) => {
    if(req.query && "q" in req.query){
      res.json(PokedexService.filterNames(req.query.q))
    }
  })

router.get('/speedchart', async (req, res) => {
  try {
    aTeam = await Draft.findById("65cbb6ea62c19728d4000000").lean()
    if (aTeam === null) {
      res.status(400).json({ message: "Draft ID not found" })
    }
    res.json(
      SpeedtierService.speedTierChart([aTeam.team], 50))
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