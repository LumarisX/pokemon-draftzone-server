import { Request, Response } from "express";
import { RouteBuilder } from "./route-builder-v2";
import { LeagueContext } from "./contexts";
import { jwtCheck } from "../../middleware/jwtcheck";
import { rolecheck } from "../../middleware/rolecheck";

/**
 * League info routes (public and admin)
 */
export function addLeagueInfoRoutes(
  builder: RouteBuilder<LeagueContext>,
): RouteBuilder<LeagueContext> {
  return (
    builder
      // Public routes
      .get("/info", async (req: Request, res: Response, ctx: LeagueContext) => {
        res.json({
          name: ctx.league.name,
          leagueKey: ctx.league.leagueKey,
        });
      })
      .get(
        "/rules",
        async (req: Request, res: Response, ctx: LeagueContext) => {
          res.json(ctx.league.rules);
        },
      )
      .get(
        "/tier-list",
        async (req: Request, res: Response, ctx: LeagueContext) => {
          await ctx.league.populate("tierList");
          res.json(ctx.league.tierList);
        },
      )

      // Auth routes
      .scope({ auth: jwtCheck }, (auth) => {
        auth.get(
          "/signup",
          async (req: Request, res: Response, ctx: LeagueContext) => {
            res.json({
              leagueKey: ctx.league.leagueKey,
              signUpDeadline: ctx.league.signUpDeadline,
            });
          },
        );

        auth.post(
          "/signup",
          async (req: Request, res: Response, ctx: LeagueContext) => {
            const { teamName, preferredDivision } = req.body;
            res.json({ success: true });
          },
        );

        // Admin routes
        auth.scope({ auth: rolecheck("organizer") }, (admin) => {
          admin.get(
            "/tier-list/edit",
            async (req: Request, res: Response, ctx: LeagueContext) => {
              await ctx.league.populate("tierList");
              res.json(ctx.league.tierList);
            },
          );

          admin.post(
            "/tier-list/edit",
            async (req: Request, res: Response, ctx: LeagueContext) => {
              const { tiers, pokemon } = req.body;
              res.json({ success: true });
            },
          );
        });
      })
  );
}
