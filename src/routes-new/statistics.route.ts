import { z } from "zod";
import { getDraftStats } from "../services/statistics-services/draft-stats.service";
import { createRoute } from "./route-builder";

export const StatisticsRoute = createRoute()((r) => {
  r.get.validate({
    query: (data) =>
      z
        .object({
          format: z.string().min(1).optional(),
          ruleset: z.string().min(1).optional(),
          splitBy: z
            .enum(["none", "format", "ruleset", "format-ruleset"])
            .optional(),
        })
        .parse(data),
  })(async (ctx) => {
    return await getDraftStats(ctx.validatedQuery);
  });
});
