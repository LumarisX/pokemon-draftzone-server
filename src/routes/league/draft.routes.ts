import { Request, Response } from "express";
import { RouteBuilder } from "./route-builder-v2";
import { TeamContext } from "./contexts";
import { jwtCheck } from "../../middleware/jwtcheck";
import { rolecheck } from "../../middleware/rolecheck";
import {
  draftPokemon,
  isCoach,
} from "../../services/league-services/draft-service";
import { PDZError } from "../../errors/pdz-error";
import { ErrorCodes } from "../../errors/error-codes";

/**
 * Draft-related routes for teams
 */
export function addDraftRoutes<TContext extends TeamContext>(
  builder: RouteBuilder<TContext>,
): RouteBuilder<TContext> {
  return (
    builder
      // Get team draft
      .get("/draft", async (req: Request, res: Response, ctx) => {
        res.json({
          draft: ctx.team.draft,
          draftedCount: ctx.team.draft.filter((p) => !p.free).length,
        });
      })

      // Get team picks only
      .get("/picks", async (req: Request, res: Response, ctx) => {
        const picks = ctx.team.draft.filter((p) => !p.free);
        res.json({ picks });
      })

      // Draft a Pokemon (coach only)
      .post("/draft", {
        auth: jwtCheck,
        middleware: [rolecheck("coach")],
        handler: async (req: Request, res: Response, ctx) => {
          const userId = req.auth?.payload.sub;
          if (!userId) {
            throw new PDZError(ErrorCodes.AUTH.NOT_AUTHENTICATED);
          }

          const { pokemon } = req.body;
          if (!pokemon) {
            throw new PDZError(ErrorCodes.BAD_REQUEST, {
              message: "Pokemon name required",
            });
          }

          // Verify user is the coach of this team
          const coachCheck = await isCoach(ctx.team._id.toString(), userId);
          if (!coachCheck) {
            throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
              message: "Not the coach of this team",
            });
          }

          await draftPokemon(
            ctx.team._id.toString(),
            ctx.division!._id.toString(),
            pokemon,
            ctx.ruleset!,
          );

          res.json({ success: true });
        },
      })
  );
}
