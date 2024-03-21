import express from "express";
import { getLearnset } from "../services/data-services/learnset.service";
import { Pokedex } from "../data/pokedex";

export const testRouter = express.Router();

testRouter.route("/test").get(async (req, res) => {
  const gen = "1-9"; // Define the generation string for testing

  const results: Record<string, string[]> = {}; // Store the results of getLearnset calls for each Pokemon
  let success = true; // Flag to indicate overall success
  // Iterate over each key in the Pokedex
  for (const pid in Pokedex) {
    if (Object.prototype.hasOwnProperty.call(Pokedex, pid)) {
      console.log(pid);
      const learnset = getLearnset(pid, gen); // Call getLearnset for the current Pokemon
      if (learnset === undefined) {
        // If getLearnset returns undefined, set success to false and break the loop
        success = false;
        break;
      }
      results[pid] = learnset; // Store the learnset for the current Pokemon
    }
  }
  // Send response based on overall success
  if (success) {
    res.json({ success: true, results });
  } else {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve learnset for some Pokémon.",
    });
  }
});
