import { Request, Response } from "express";
import { Router } from "express";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";

export const TeambuilderRoute = Router();

TeambuilderRoute.get("/pokemonData", async (req: Request, res: Response) => {
  try {
    const rulesetId = req.query.ruleset;
    const id = req.query.id;
    if (typeof rulesetId === "string" && typeof id === "string") {
      const ruleset = getRuleset(rulesetId);
      const specie = ruleset.species.get(id);
      if (specie) {
        const draftSpecies = new DraftSpecie(specie, ruleset);
        return res.json(await draftSpecies.toTeambuilder());
      }
    }

    return res.status(400).json({ error: "General error", code: "TR-R1-02" });
  } catch (error) {
    console.error("Error in /formats/ route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "TR-R1-01" });
  }
});

// TeambuilderRoutes.get("/pats-list", async (_req: Request, res: Response) => {
//   try {
//     const data: PikalyticData[] = JSON.parse(
//       fs.readFileSync("./src/services/pats-services/pats.json", "utf-8"),
//     );
//     return res.json(
//       data.map((pokemon) => ({
//         name: pokemon.name,
//         id: toID(pokemon.name),
//         percent: pokemon.percent,
//       })),
//     );
//   } catch (error) {
//     console.error("Error in /formats/ route:", error);
//     res.status(500).json({ error: "Internal Server Error", code: "TR-R2-01" });
//   }
// });

// TeambuilderRoutes.get(
//   "/pats-matchup",
//   async (req: Request, res: Response) => {
//     try {
//       const { set, opp } = req.query;
//       if (typeof set === "string" && typeof opp === "string") {
//         const pokemonData = JSON.parse(atob(set));
//         const pokemon = new Pokemon(9, pokemonData.name, pokemonData);
//         return res.json(testSet(pokemon, opp));
//       }
//       return res
//         .status(400)
//         .json({ error: "Internal Server Error", code: "TR-R3-02" });
//     } catch (error) {
//       console.error("Error in /formats/ route:", error);
//       res
//         .status(500)
//         .json({ error: "Internal Server Error", code: "TR-R3-01" });
//     }
//   },
// );
