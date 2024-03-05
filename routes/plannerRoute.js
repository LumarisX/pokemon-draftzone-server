const express = require("express");
const router = express.Router();
const summaryService = require("../services/matchup-services/summary-service");
const TypechartService = require("../services/matchup-services/typechart-service");

router.route("/").get(async (req, res) => {
  try {
    let team = [];
    if (req.query && "team" in req.query) {
      for (let pid of req.query.team.split(",")) {
        team.push({ pid: pid });
      }
      res.json({
        typechart: TypechartService.typechart(team),
        summary: summaryService.summary(team),
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
