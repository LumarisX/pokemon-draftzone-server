import express, { NextFunction, Request, Response } from "express";
import { getFormats, getRulesets } from "../services/ruleset.service";
import {
  filterNames,
  getSpecies,
} from "../services/data-services/pokedex.service";
import { Ruleset, Rulesets } from "../data/rulesets";

export const dataRouter = express.Router();

type DataResponse = Response & { ruleset?: Ruleset };

dataRouter.get("/formats", (req: Request, res: Response) => {
  try {
    res.json(getFormats());
  } catch (error) {
    console.error("Error in /formats/ route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R1-01" });
  }
});

dataRouter.get("/rulesets", (req: Request, res: Response) => {
  try {
    res.json(getRulesets());
  } catch (error) {
    console.error("Error in /rulesets/ route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R2-01" });
  }
});

dataRouter.get("/nameList", (req: Request, res: DataResponse) => {
  try {
    let ruleset = req.query.ruleset;
    if (typeof ruleset == "string") {
      if (!(ruleset in Rulesets)) {
        ruleset = "Gen9 NatDex";
      }
      res.json(getSpecies(Rulesets[ruleset]));
    }
  } catch (error) {
    console.error("Error in /rulesets/ route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R2-01" });
  }
});

dataRouter.route("/search").get(async (req: Request, res: DataResponse) => {
  try {
    let ruleset = req.query.ruleset;
    let query = req.query.query;
    if (typeof ruleset == "string" && typeof query == "string") {
      if (!(ruleset in Rulesets)) {
        ruleset = "Gen9 NatDex";
      }
      res.json(filterNames(Rulesets[ruleset], query));
    } else {
      res.status(400).json({ error: "Ruleset type error", code: "DT-R3-01" });
    }
  } catch (error) {
    console.error("Error in /search route:", error);
    res.status(500).json({ error: "Internal Server Error", code: "DT-R3-02" });
  }
});

// router.get("/:id", (req: Request, res: Response) => {
//   try {
//     res.send(pokedex[req.params.id]);
//   } catch (error) {
//     console.error("Error in /:id route:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// router.get("/:id/weak", (req: Request, res: Response) => {
//   try {
//     var weak = null;
//     const dmgConvert = [1, 2, 0.5, 0];
//     let types = pokedex[req.params.id]["types"];
//     for (let t of types) {
//       t = t.toLowerCase();
//       if (weak === null) {
//         weak = structuredClone(typechart[t]["damageTaken"]);
//         for (let w in weak) {
//           weak[w] = dmgConvert[weak[w]];
//         }
//       } else {
//         var ot = structuredClone(typechart[t]["damageTaken"]);
//         for (let w in weak) {
//           if (w in ot) {
//             weak[w] = weak[w] * dmgConvert[ot[w]];
//           }
//           delete ot[w];
//         }
//         for (let w in ot) {
//           weak[w] = ot[w];
//         }
//       }
//     }
//     res.send(weak);
//   } catch (error) {
//     console.error("Error in /:id/weak route:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// router.get("/:id/:key", (req: Request, res: Response) => {
//   try {
//     res.send(pokedex[req.params.id][req.params.key]);
//   } catch (error) {
//     console.error("Error in /:id/:key route:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// router.param("id", (req, res, next, id) => {
//   next();
// });
