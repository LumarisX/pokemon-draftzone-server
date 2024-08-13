import { ID } from "@pkmn/dex";
import express from "express";
import { Rulesets } from "../data/rulesets";
import { speedchart } from "../services/matchup-services/speedchart.service";

export const testRouter = express.Router();

testRouter.route("/test").get(async (req, res) => {
  const ruleset = Rulesets["Paldea Dex"];
  res.json(
    speedchart(
      ruleset,
      [
        [
          { id: "gallade" as ID, name: "Gallade" },
          { id: "deoxys" as ID, name: "Deoxys" },
          { id: "mew" as ID, name: "Mew" },
        ],
        [
          { id: "pikachu" as ID, name: "Pikachu" },
          { id: "charizard" as ID, name: "Charizard" },
          { id: "heatran" as ID, name: "Heatran" },
        ],
      ],
      100
    )
  );
});
