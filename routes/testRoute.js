const express = require('express');
const router = express.Router();
const ps = require("../services/pokedex-service");
const Pokedex = require("../public/data/pokedex")["BattlePokedex"]

router
  .route('/')
  .get(async (req, res) => {
    res.json(pokedexNames())
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