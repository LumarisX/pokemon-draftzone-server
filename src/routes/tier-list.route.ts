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
    return {
      tierListId,
      tierListRuleset: doc.ruleset,
      tierListName: doc.name,
      tierListDescription: doc.description,
      tierListPointTotal: doc.pointTotal,
      tierListDraftCount: doc.draftCount,
    };
  })(async (r) => {
    r.get(async (ctx) => {
      const tierList = await getTierList(ctx.tierListId);
      return {
        tierList,
        divisions: {},
        ruleset: ctx.tierListRuleset,
        name: ctx.tierListName,
        description: ctx.tierListDescription,
        draftCount: ctx.tierListDraftCount,
      };
    });
    r.path("settings").auth()((r) => {
      r.get(async (ctx) => {
        return {
          name: ctx.tierListName,
          description: ctx.tierListDescription,
          pointTotal: ctx.tierListPointTotal,
          draftCount: ctx.tierListDraftCount,
        };
      });
      r.patch.validate({
        body: (data) =>
          z
            .object({
              name: z.string().min(1).optional(),
              description: z.string().optional(),
              pointTotal: z.number().int().nonnegative().optional(),
              draftCount: z
                .object({
                  min: z.number().int().nonnegative(),
                  max: z.number().int().nonnegative(),
                })
                .optional(),
            })
            .parse(data),
      })(async (ctx) => {
        const { name, description, pointTotal, draftCount } = ctx.validatedBody;
        const update: Record<string, unknown> = {};
        if (name !== undefined) update["name"] = name;
        if (description !== undefined) update["description"] = description;
        if (pointTotal !== undefined) update["pointTotal"] = pointTotal;
        if (draftCount !== undefined) update["draftCount"] = draftCount;
        await tierListModel.findByIdAndUpdate(ctx.tierListId, { $set: update });
        return { success: true };
      });
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
        return { tierList, divisions: {}, name: ctx.tierListName };
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
                      notes: z.string().optional(),
                      bannedAbilities: z.array(z.string()).optional(),
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
