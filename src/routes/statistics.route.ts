import { Router } from "express";
import { z } from "zod";
import { getDraftStats } from "../services/statistics-services/draft-stats.service";
import { validateQuery } from "./validation";

export const StatisticsRoute = Router();

StatisticsRoute.get("/", async (req, res) => {
  const query = validateQuery(
    z.object({
      format: z.string().min(1).optional(),
      ruleset: z.string().min(1).optional(),
      splitBy: z
        .enum(["none", "format", "ruleset", "format-ruleset"])
        .optional(),
    }),
    req.query,
  );
  const stats = await getDraftStats(query);
  return res.json(stats);
});
