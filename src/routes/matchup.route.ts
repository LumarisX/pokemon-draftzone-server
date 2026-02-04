import { Request, Response } from "express";
import mongoose from "mongoose";
import { RouteOld, sendError } from ".";
import { logger } from "../app";
import { Matchup } from "../classes/matchup";
import { getRuleset, Ruleset } from "../data/rulesets";
import { MatchupData, MatchupDocument } from "../models/draft/matchup.model";
import { getDraft } from "../services/database-services/draft.service";
import {
  deleteMatchup,
  getMatchupById,
} from "../services/database-services/matchup.service";
import { coveragechart } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { speedchart } from "../services/matchup-services/speedchart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { jwtCheck } from "../middleware/jwtcheck";
import { createRoute } from "./route-builder";
import { PDZError } from "../errors/pdz-error";
import { ErrorCodes } from "../errors/error-codes";
import z from "zod";

type MatchupResponse = Response & {
  rawMatchup?: MatchupDocument | null;
  matchup?: Matchup;
  ruleset?: Ruleset;
};

const routeCode = "MR";

export const MatchupRoutes: RouteOld = {
  subpaths: {
    "/:matchup_id": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const matchup = res.matchup!;
          const data = await matchup.analyze();
          res.json(data);
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R1-01`);
        }
      },
      delete: async (req: Request, res: MatchupResponse) => {
        try {
          await deleteMatchup(req.params.matchup_id);
          res.json({ message: "Matchup deleted" });
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R1-02`);
        }
      },
    },
    "/:matchup_id/summary": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const aTeamsummary = new SummaryClass(
            res.matchup!.aTeam.team,
            res.matchup!.aTeam.teamName,
          );
          const bTeamsummary = new SummaryClass(
            res.matchup!.bTeam.team,
            res.matchup!.bTeam.teamName,
          );
          res.json([aTeamsummary.toJson(), bTeamsummary.toJson()]);
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R2-02`);
        }
      },
    },
    "/:matchup_id/typechart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          res.json([
            new Typechart(res.matchup!.aTeam.team).toJson(),
            new Typechart(res.matchup!.bTeam.team).toJson(),
          ]);
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R3-01`);
        }
      },
    },
    "/:matchup_id/speedchart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const level = res.matchup!.format.level;
          res.json(
            speedchart(
              [res.matchup!.aTeam.team, res.matchup!.bTeam.team],
              level,
            ),
          );
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R4-01`);
        }
      },
    },
    "/:matchup_id/coveragechart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          res.json([
            coveragechart(res.matchup!.aTeam.team, res.matchup!.bTeam.team),
            coveragechart(res.matchup!.bTeam.team, res.matchup!.aTeam.team),
          ]);
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R5-01`);
        }
      },
    },
    "/:matchup_id/movechart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          res.json(
            await Promise.all([
              movechart(res.matchup!.aTeam.team, res.matchup!.ruleset),
              movechart(res.matchup!.bTeam.team, res.matchup!.ruleset),
            ]),
          );
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R6-01`);
        }
      },
    },
    "/:matchup_id/notes": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const matchupDoc = res.rawMatchup;
          if (!matchupDoc) {
            return sendError(
              res,
              404,
              new Error("Matchup not found"),
              `MR-R1-03`,
            );
          }
          res.json({ notes: matchupDoc.notes || "" });
        } catch (error) {
          logger.error(`[update-notes] Error: ${error}`);
          return sendError(res, 500, error as Error, `MR-R1-01`);
        }
      },
    },
    "/:matchup_id/update-notes": {
      post: async (req: Request, res: MatchupResponse) => {
        try {
          const matchupDoc = res.rawMatchup;
          if (!matchupDoc) {
            return sendError(
              res,
              404,
              new Error("Matchup not found"),
              `MR-R1-03`,
            );
          }

          const userSub = req.auth?.payload.sub;
          const aTeamDraft = await getDraft(matchupDoc.aTeam._id);
          if (!aTeamDraft) {
            return sendError(
              res,
              404,
              new Error("Draft not found for aTeam"),
              `MR-R1-06`,
            );
          }
          const ownerSub = aTeamDraft.owner;
          if (!userSub || userSub !== ownerSub) {
            return sendError(
              res,
              403,
              new Error("Forbidden: Not matchup owner"),
              `MR-R1-04`,
            );
          }

          const notes = req.body.notes;
          if (typeof notes !== "string") {
            return sendError(
              res,
              400,
              new Error("Invalid notes format"),
              `MR-R1-05`,
            );
          }
          matchupDoc.notes = notes;
          logger.info(
            `[update-notes] About to save matchupDoc for id: ${matchupDoc._id}`,
          );
          await matchupDoc.save();
          logger.info(
            `[update-notes] Successfully saved matchupDoc for id: ${matchupDoc._id}`,
          );
          res.json({ success: true });
        } catch (error) {
          logger.error(`[update-notes] Error: ${error}`);
          return sendError(res, 500, error as Error, `MR-R1-01`);
        }
      },
      middleware: [jwtCheck],
    },
    "/quick": {
      post: async (req: Request, res: Response) => {
        const matchup = await Matchup.fromQuickData(req.body);
        const data = await matchup.analyze();
        res.json(data);
      },
    },
  },
  params: {
    matchup_id: async (
      req: Request,
      res: MatchupResponse,
      next,
      matchup_id,
    ) => {
      try {
        if (mongoose.Types.ObjectId.isValid(matchup_id)) {
          res.rawMatchup = await getMatchupById(matchup_id);
          if (!res.rawMatchup) {
            logger.error(`Matchup not found for matchup_id: ${matchup_id}`);
            return res.status(404).json({
              message: "Matchup not found.",
              code: `${routeCode}-P1-01`,
            });
          }
          const matchupData = res.rawMatchup.toObject<MatchupData>();
          res.matchup = await Matchup.fromData(matchupData);
          const aTeam = await getDraft(matchupData.aTeam._id);
          if (!aTeam) {
            logger.error(
              `Draft not found for matchup's aTeam._id: ${matchupData.aTeam._id}`,
            );
            return res.status(404).json({
              message: "Draft not found for this matchup.",
              code: `${routeCode}-P1-02`,
            });
          }
          res.ruleset = getRuleset(aTeam.ruleset);
          if (!res.ruleset) {
            logger.error(
              `Invalid ruleset ID for matchup's aTeam.ruleset: ${aTeam.ruleset}`,
            );
            return res.status(500).json({
              message: "Invalid ruleset ID for this matchup.",
              code: `${routeCode}-P1-03`,
            });
          }
        } else {
          logger.error(`Invalid matchup ID format: ${matchup_id}`);
          return res
            .status(400) // Bad Request
            .json({
              message: "Invalid matchup ID format.",
              code: `${routeCode}-P1-04`,
            });
        }
      } catch (error) {
        return sendError(res, 500, error as Error, `MR-P1-05`);
      }
      next();
    },
  },
};

export const MatchupRoute = createRoute()((r) => {
  r.path("quick")((r) => {
    r.post.validate({
      //TODO: refine this schema
      body: (data) => z.any().parse(data),
    })(
      async (ctx) =>
        await (await Matchup.fromQuickData(ctx.validatedBody)).analyze(),
    );
  });
  r.param("matchup_id", {
    validate: (matchup_id) => mongoose.Types.ObjectId.isValid(matchup_id),
    loader: async (ctx, matchup_id) => {
      const rawMatchup = await getMatchupById(matchup_id);
      const matchup = await Matchup.fromData(rawMatchup);
      const aTeam = await getDraft(rawMatchup.aTeam._id);
      const ruleset = getRuleset(aTeam.ruleset);
      return { rawMatchup, matchup, ruleset, matchup_id };
    },
  })((r) => {
    r.get(async (ctx) => await ctx.matchup.analyze());
    r.delete(async (ctx) => {
      await deleteMatchup(ctx.matchup_id);
      return { message: "Matchup deleted" };
    });
    r.path("summary")((r) => {
      r.get(async (ctx) => {
        const aTeamsummary = new SummaryClass(
          ctx.matchup.aTeam.team,
          ctx.matchup.aTeam.teamName,
        );
        const bTeamsummary = new SummaryClass(
          ctx.matchup.bTeam.team,
          ctx.matchup.bTeam.teamName,
        );
        return [aTeamsummary.toJson(), bTeamsummary.toJson()];
      });
    });
    r.path("typechart")((r) => {
      r.get(async (ctx) => [
        new Typechart(ctx.matchup.aTeam.team).toJson(),
        new Typechart(ctx.matchup.bTeam.team).toJson(),
      ]);
    });
    r.path("speedchart")((r) => {
      r.get(async (ctx) =>
        speedchart(
          [ctx.matchup.aTeam.team, ctx.matchup.bTeam.team],
          ctx.matchup.format.level,
        ),
      );
    });
    r.path("coveragechart")((r) => {
      r.get(async (ctx) => [
        coveragechart(ctx.matchup.aTeam.team, ctx.matchup.bTeam.team),
        coveragechart(ctx.matchup.bTeam.team, ctx.matchup.aTeam.team),
      ]);
    });
    r.path("movechart")((r) => {
      r.get(
        async (ctx) =>
          await Promise.all([
            movechart(ctx.matchup.aTeam.team, ctx.ruleset),
            movechart(ctx.matchup.bTeam.team, ctx.ruleset),
          ]),
      );
    });
    r.path("notes")((r) => {
      r.get(async (ctx) => ({ notes: ctx.rawMatchup.notes || "" }));
    });
    r.path("update-notes")((r) => {
      r.post.auth().validate({
        body: (data) => z.object({ notes: z.string() }).parse(data),
      })(async (ctx) => {
        const matchupDoc = ctx.rawMatchup;
        const aTeamDraft = await getDraft(matchupDoc.aTeam._id);
        const ownerSub = aTeamDraft.owner;
        if (ctx.sub !== ownerSub) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
        const { notes } = ctx.validatedBody;
        matchupDoc.notes = notes;
        await matchupDoc.save();
        return { success: true };
      });
    });
  });
});
