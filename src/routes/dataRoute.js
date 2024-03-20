var express = require("express");
var router = express.Router();
const PokedexService = require("../services/pokedex-service");
const rulesetService = require("../services/ruleset-service");

router.get("/formats/", (req, res) => {
  try {
    res.json(rulesetService.getFormats());
  } catch (error) {
    console.error("Error in /formats/ route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.route("/search").get(async (req, res) => {
  try {
    if (req.query && "q" in req.query) {
      res.json(PokedexService.filterNames(req.query.q));
    }
  } catch (error) {
    console.error("Error in /search route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/rulesets/", (req, res) => {
  try {
    res.json(rulesetService.getRulesets());
  } catch (error) {
    console.error("Error in /rulesets/ route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/pokedex/", (req, res) => {
  try {
    res.send(Object.keys(pokedex));
  } catch (error) {
    console.error("Error in /pokedex/ route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", (req, res) => {
  try {
    res.send(pokedex[req.params.id]);
  } catch (error) {
    console.error("Error in /:id route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id/weak", (req, res) => {
  try {
    var weak = null;
    const dmgConvert = [1, 2, 0.5, 0];
    let types = pokedex[req.params.id]["types"];
    for (let t of types) {
      t = t.toLowerCase();
      if (weak === null) {
        weak = structuredClone(typechart[t]["damageTaken"]);
        for (let w in weak) {
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
    res.send(weak);
  } catch (error) {
    console.error("Error in /:id/weak route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id/:key", (req, res) => {
  try {
    res.send(pokedex[req.params.id][req.params.key]);
  } catch (error) {
    console.error("Error in /:id/:key route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.param("id", (req, res, next, id) => {
  next();
});

module.exports = router;
