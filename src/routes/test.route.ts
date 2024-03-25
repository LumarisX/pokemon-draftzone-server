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
          { pid: "gallade" as ID, name: "Gallade" },
          { pid: "deoxys" as ID, name: "Deoxys" },
          { pid: "mew" as ID, name: "Mew" },
        ],
        [
          { pid: "pikachu" as ID, name: "Pikachu" },
          { pid: "charizard" as ID, name: "Charizard" },
          { pid: "heatran" as ID, name: "Heatran" },
        ],
      ],
      100
    )
  );
});
