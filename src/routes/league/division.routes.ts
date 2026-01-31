import { Request, Response } from "express";
import { RouteBuilder } from "./route-builder-v2";
import { DivisionContext, withTeam, TeamContext } from "./contexts";
import { jwtCheck } from "../../middleware/jwtcheck";
import { rolecheck } from "../../middleware/rolecheck";
import * as draftService from "../../services/league-services/draft-service";

/**
 * Division routes module
 */
export function addDivisionRoutes(
  builder: RouteBuilder<DivisionContext>,
): RouteBuilder<DivisionContext> {
  return (
    builder
      // Public routes
      .get("/", async (req: Request, res: Response, ctx: DivisionContext) => {
        res.json(ctx.division);
      })
      .get(
        "/schedule",
        async (req: Request, res: Response, ctx: DivisionContext) => {
          res.json({ schedule: [] });
        },
      )
      .get(
        "/standings",
        async (req: Request, res: Response, ctx: DivisionContext) => {
          res.json({ standings: [] });
        },
      )

      // Auth routes
      .scope({ auth: jwtCheck }, (auth) => {
        auth.get(
          "/picks",
          async (req: Request, res: Response, ctx: DivisionContext) => {
            res.json({ picks: [] });
          },
        );

        auth.get(
          "/power-rankings",
          async (req: Request, res: Response, ctx: DivisionContext) => {
            res.json({ rankings: [] });
          },
        );
      })

      // Management routes
      .scope(
        {
          path: "/manage",
          auth: [jwtCheck, rolecheck("organizer")],
        },
        (manage) => {
          manage.post(
            "/state",
            async (req: Request, res: Response, ctx: DivisionContext) => {
              res.json({ success: true });
            },
          );

          manage.post(
            "/skip",
            async (req: Request, res: Response, ctx: DivisionContext) => {
              await draftService.skipCurrentPick(ctx.league, ctx.division);
              res.json({ success: true });
            },
          );
        },
      )

      // Team routes
      .scope(
        {
          path: "/teams/:team_id",
          load: withTeam,
          auth: jwtCheck,
        },
        (team) => {
          team.post(
            "/draft",
            async (req: Request, res: Response, ctx: TeamContext) => {
              const { pokemon, teraType } = req.body;
              await draftService.draftPokemon({
                divisionId: ctx.division._id.toString(),
                teamId: ctx.team._id.toString(),
                pokemon,
                teraType,
              });
              res.json({ success: true });
            },
          );

          team.post(
            "/picks",
            async (req: Request, res: Response, ctx: TeamContext) => {
              res.json({ success: true });
            },
          );
        },
      )
  );
}
