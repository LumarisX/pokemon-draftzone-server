const express = require("express");
const router = express.Router();
const Draft = require("../models/draftModel");
const Matchup = require("../models/matchupModel.js");
const summaryService = require("../services/matchup-services/summary-service");
const SpeedtierService = require("../services/matchup-services/speedtier-service");
const TypechartService = require("../services/matchup-services/typechart-service");
const CoverageService = require("../services/matchup-services/coverage-service");
const MovechartService = require("../services/matchup-services/movechart-service");
const Rulesets = require("../public/data/rulesets");
const { ObjectId } = require("mongodb");
const PokedexService = require("../services/pokedex-service");

router
  .route("/:matchup_id")
  .get(async (req, res) => {
    try {
      let level = Rulesets.Formats[res.matchup.format].level;
      let gen = Rulesets.Rulesets[res.matchup.ruleset].gen;
      let data = {
        format: res.matchup.format,
        ruleset: res.matchup.ruleset,
        level: level,
        stage: res.matchup.stage,
        leagueName: res.matchup.leagueName,
      };
      let aTeamsummary = summaryService.summary(res.matchup.aTeam.team);
      let bTeamsummary = summaryService.summary(res.matchup.bTeam.team);
      aTeamsummary.teamName = res.matchup.aTeam.teamName;
      bTeamsummary.teamName = res.matchup.bTeam.teamName;
      data.summery = [aTeamsummary, bTeamsummary];
      data.typechart = [
        TypechartService.typechart(res.matchup.aTeam.team),
        TypechartService.typechart(res.matchup.bTeam.team),
      ];
      data.speedchart = SpeedtierService.speedTierChart(
        [res.matchup.aTeam.team, level, res.matchup.bTeam.team],
        level
      );
      data.coveragechart = [
        CoverageService.chart(
          res.matchup.aTeam.team,
          res.matchup.bTeam.team,
          gen
        ),
        CoverageService.chart(
          res.matchup.bTeam.team,
          res.matchup.aTeam.team,
          gen
        ),
      ];
      data.movechart = [
        MovechartService.chart(res.matchup.aTeam.team, gen),
        MovechartService.chart(res.matchup.bTeam.team, gen),
      ];
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .delete(async (req, res) => {
    try {
      await res.rawMatchup.deleteOne();
      res.json({ message: "Matchup deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router.get("/:matchup_id/summary", async (req, res) => {
  try {
    let aTeamsummary = summaryService.summary(res.matchup.aTeam.team);
    let bTeamsummary = summaryService.summary(res.matchup.bTeam.team);
    aTeamsummary.teamName = res.matchup.aTeam.teamName;
    bTeamsummary.teamName = res.matchup.bTeam.teamName;
    res.json([aTeamsummary, bTeamsummary]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:matchup_id/typechart", async (req, res) => {
  try {
    res.json([
      TypechartService.typechart(res.matchup.aTeam.team),
      TypechartService.typechart(res.matchup.bTeam.team),
    ]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:matchup_id/speedchart", async (req, res) => {
  try {
    let level = Rulesets.Formats[res.matchup.format].level;
    res.json(
      SpeedtierService.speedTierChart(
        [res.matchup.aTeam.team, level, res.matchup.bTeam.team],
        level
      )
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:matchup_id/coveragechart", async (req, res) => {
  try {
    let gen = Rulesets.Rulesets[res.matchup.ruleset].gen;
    res.json([
      CoverageService.chart(
        res.matchup.aTeam.team,
        res.matchup.bTeam.team,
        gen
      ),
      CoverageService.chart(
        res.matchup.bTeam.team,
        res.matchup.aTeam.team,
        gen
      ),
    ]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:matchup_id/movechart", async (req, res) => {
  try {
    let gen = Rulesets.Rulesets[res.matchup.ruleset].gen;
    res.json([
      MovechartService.chart(res.matchup.aTeam.team, gen),
      MovechartService.chart(res.matchup.bTeam.team, gen),
    ]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.param("matchup_id", async (req, res, next, matchup_id) => {
  try {
    if (ObjectId.isValid(matchup_id)) {
      let matchup = await Matchup.findById(matchup_id).lean();
      if (matchup === null) {
        res.status(400).json({ message: "Matchup ID not found" });
      }
      aTeam = await Draft.findById(matchup.aTeam._id).lean();
      if (aTeam === null) {
        res.status(400).json({ message: "Draft ID not found" });
      }
      for (let pokemon of aTeam.team) {
        pokemon.name = PokedexService.getName(pokemon.pid);
      }
      matchup.leagueName = aTeam.leagueName;
      matchup.format = aTeam.format;
      matchup.ruleset = aTeam.ruleset;
      matchup.aTeam = {
        owner: aTeam.owner,
        teamName: aTeam.teamName,
        team: aTeam.team,
        _id: aTeam._id,
      };
      for (let pokemon of matchup.aTeam.team) {
        pokemon.name = PokedexService.getName(pokemon.pid);
      }
      for (let pokemon of matchup.bTeam.team) {
        pokemon.name = PokedexService.getName(pokemon.pid);
      }
      res.matchup = matchup;
    } else {
      return res.status(400).json({ message: "Invalid ID format" });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

module.exports = router;
