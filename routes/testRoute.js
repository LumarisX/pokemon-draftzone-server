const express = require('express');
const router = express.Router();
const ss = require("../services/speedtier-service.js");

router
  .route('/')
  .get(async (req, res) => {
      res.json(ss.speedTierChart(["blaziken"],["maractus"]));

  })
  

module.exports = router;