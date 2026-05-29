import z from "zod";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import tierListModel from "../models/league/tier-list.model";
import { getTierList } from "../services/tier-lists-services/tier-list-service";
import { createRoute } from "./route-builder";
import { updateTierList } from "../services/league-services/tier-list-service";

export const TierListRoute = createRoute()((r) => {
  r.param("tierListId", async (ctx, tierListId) => {
    const doc = await tierListModel.findById(tierListId);
    if (!doc) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    return { tierListId, tierListRuleset: doc.ruleset };
  })(async (r) => {
    r.get(async (ctx) => {
      const tierList = await getTierList(ctx.tierListId);
      return { tierList, divisions: {}, ruleset: ctx.tierListRuleset };
    });
    r.path("edit").auth()((r) => {
      r.get.validate({
        query: (data) =>
          z
            .object({
              division: z
                .union([z.string().min(1), z.array(z.string().min(1))])
                .optional(),
            })
            .parse(data),
      })(async (ctx) => {
        const tierList = await getTierList(ctx.tierListId, true);
        return { tierList, divisions: {} };
      });
      r.post.validate({
        body: (data) =>
          z
            .object({
              tiers: z.array(
                z.object({
                  name: z.string(),
                  cost: z.number(),
                  pokemon: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      banned: z.boolean().optional(),
                    }),
                  ),
                }),
              ),
            })
            .parse(data),
      })(async (ctx) => {
        const { tiers } = ctx.validatedBody;
        await updateTierList(ctx.tierListId, tiers);
        return {
          success: true,
          message: "Tier list updated successfully",
        };
      });
    });
  });
});
