import { Generations } from "@pkmn/data";
import { Dex, ID } from "@pkmn/dex";
import express from "express";
import { typechart } from "../services/matchup-services/typechart.service";
import { summary } from "../services/matchup-services/summary.service";

export const testRouter = express.Router();

testRouter.route("/test").get(async (req, res) => {
  const gens = new Generations(Dex);
  const gen = gens.get(9);
  res.json(
    summary(gen, [
      { pid: "pikachu" as ID, name: "Pikachu" },
      { pid: "charizard" as ID, name: "Charizard" },
    ])
  );
});
