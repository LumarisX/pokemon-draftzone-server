var express = require('express');
var router = express.Router();

const pokedex = require("../public/data/pokedex.js")["BattlePokedex"]
const typechart = require("../public/data/typechart.js")["BattleTypeChart"]

/* GET users listing. */
router.get('/', (req, res) => {
  res.send(Object.keys(pokedex));
});

router.get('/:id', (req, res) => {
  res.send(pokedex[req.params.id]);
});

router.get('/:id/weak', (req, res) => {
  var weak = null;
  const dmgConvert = [1,2,.5,0]
  let types = pokedex[req.params.id]["types"];
  for (let t of types) {
    t=t.toLowerCase();
    if (weak === null) {
      weak = structuredClone(typechart[t]["damageTaken"]);
      for(let w in weak){
        weak[w] = dmgConvert[weak[w]];
      }
    } else {
      var ot = structuredClone(typechart[t]["damageTaken"]);
      for (let w in weak) {
        if (w in ot) {
          weak[w] = weak[w] * dmgConvert[ot[w]];
        }
        delete ot[w];
      }
      for (let w in ot) {
        weak[w] = ot[w];
      }
    }
  }
  /*
  for (let a in pokedex[req.params.id]["abilities"]) {
    let ability = toKey(pokedex[req.params.id]["abilities"][a]);
    if (ability in typechart) {
      var ot = structuredClone(typechart[ability]["damageTaken"]);
      for (let w in weak) {
        if (w in ot) {
          weak[w] = weak[w] * ot[w];
        }
        delete ot[w];
      }
      for (let w in ot) {
        weak[w] = ot[w];
      }
    }
  }
  */
  res.send(weak);
});

router.get('/:id/:key', (req, res) => {
  res.send(pokedex[req.params.id][req.params.key]);
});

router.param("id", (req, res, next, id) => {
  console.log(id);
  next();
});


module.exports = router;