import { Generations } from "@pkmn/data";
import { Dex, ID } from "@pkmn/dex";
import express from "express";
import { typechart } from "../services/matchup-services/typechart.service";
import { summary } from "../services/matchup-services/summary.service";
import { coveragechart } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";

export const testRouter = express.Router();

testRouter.route("/test").get(async (req, res) => {
  const gens = new Generations(Dex);
  const gen = gens.get(9);
  res.json(
    await movechart(gen, [
      { pid: "pikachu" as ID, name: "Pikachu" },
      { pid: "charizard" as ID, name: "Charizard" },
      { pid: "heatran" as ID, name: "Heatran" },
    ])
  );
});
