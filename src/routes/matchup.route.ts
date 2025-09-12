import { Request, Response } from "express";
import mongoose from "mongoose";
import { Route, sendError } from ".";
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

type MatchupResponse = Response & {
  rawMatchup?: MatchupDocument | null;
  matchup?: Matchup;
  ruleset?: Ruleset;
};

const routeCode = "MR";

export const MatchupRoutes: Route = {
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
            res.matchup!.aTeam.teamName
          );
          const bTeamsummary = new SummaryClass(
            res.matchup!.bTeam.team,
            res.matchup!.bTeam.teamName
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
              level
            )
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
            ])
          );
        } catch (error) {
          return sendError(res, 500, error as Error, `MR-R6-01`);
        }
      },
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
      matchup_id
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
              `Draft not found for matchup's aTeam._id: ${matchupData.aTeam._id}`
            );
            return res.status(404).json({
              message: "Draft not found for this matchup.",
              code: `${routeCode}-P1-02`,
            });
          }
          res.ruleset = getRuleset(aTeam.ruleset);
          if (!res.ruleset) {
            logger.error(
              `Invalid ruleset ID for matchup's aTeam.ruleset: ${aTeam.ruleset}`
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
