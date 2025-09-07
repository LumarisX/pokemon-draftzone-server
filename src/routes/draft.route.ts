import { Request, Response } from "express";
import { startSession, Types } from "mongoose";
import { jwtCheck, Route, sendError } from ".";
import { logger } from "../app";
import { ArchiveOld } from "../classes/archive";
import { Draft } from "../classes/draft";
import { GameTime, Matchup, Score } from "../classes/matchup";
import { Opponent } from "../classes/opponent";
import { getRuleset, Ruleset } from "../data/rulesets";
import { DraftData, DraftDocument } from "../models/draft.model";
import { MatchupData, MatchupDocument } from "../models/matchup.model";
import {
  createDraft,
  deleteDraft,
  getDraft,
  getDraftsByOwner,
  getScore,
  getStats,
  updateDraft,
} from "../services/database-services/draft.service";
import {
  clearMatchupCacheById,
  createMatchup,
  getMatchupById,
  getMatchupsByDraftId,
  updateMatchup,
} from "../services/database-services/matchup.service";

type MatchupResponse = DraftResponse & {
  matchup?: Matchup;
  rawMatchup?: MatchupDocument;
};

type DraftResponse = Response & {
  rawDraft?: DraftDocument | null;
  draftOld?: DraftData & {
    _id: Types.ObjectId;
  };
  draft?: Draft;
  ruleset?: Ruleset;
};

const routeCode = "DR";

export const DraftRoutes: Route = {
  middleware: [jwtCheck],
  subpaths: {
    "/teams": {
      get: async function (req: Request, res: DraftResponse) {
        try {
          const drafts = await getDraftsByOwner(req.auth!.payload.sub!);
          res.json(
            await Promise.all(
              drafts.map(
                async (draft) => await Draft.fromData(draft).toClient()
              )
            )
          );
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-01`);
        }
      },
      post: async function (req: Request, res: DraftResponse) {
        if (!req.auth!.payload.sub!) {
          return;
        }
        try {
          const draft = Draft.fromForm(req.body, req.auth!.payload.sub!);
          await createDraft(draft.toData());
          return res.status(201).json({ message: "Draft Added" });
        } catch (error: any) {
          if (error.code === 11000) {
            return res.status(409).json({
              message: "A draft with this league name already exists.",
              code: `${routeCode}-R1-02`,
            });
          }
          return sendError(res, 500, error as Error, `${routeCode}-R1-03`);
        }
      },
    },
    "/:team_id": {
      get: async function (req: Request, res: DraftResponse) {
        if (!res.draftOld) {
          return;
        }
        try {
          res.draftOld.score = await getScore(res.draftOld._id);
          res.json(await res.draft!.toClient());
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-03`);
        }
      },
      patch: async function (req: Request, res: MatchupResponse) {
        if (!req.auth!.payload.sub!) return;
        try {
          const draft = Draft.fromForm(
            req.body,
            req.auth!.payload.sub!
          ).toData();
          const updatedDraft = await updateDraft(
            req.auth!.payload.sub!,
            req.params.team_id,
            draft
          );
          if (updatedDraft) {
            const matchups = await getMatchupsByDraftId(updatedDraft._id);
            matchups.forEach((matchup) =>
              clearMatchupCacheById(matchup._id.toString())
            );
            return res
              .status(200)
              .json({ message: "Draft Updated", draft: updatedDraft });
          } else {
            return res
              .status(404)
              .json({ message: "Draft not found", code: `${routeCode}-R2-02` });
          }
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-03`);
        }
      },
      delete: async function (req: Request, res: DraftResponse) {
        if (!res.rawDraft) {
          return;
        }
        try {
          await deleteDraft(res.rawDraft);
          return res.status(201).json({ message: "Draft deleted" });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-04`);
        }
      },
    },
    "/:team_id/matchups": {
      get: async function (req: Request, res: DraftResponse) {
        try {
          const matchups: MatchupDocument[] = await res.draft!.getMatchups();
          res.json(
            await Promise.all(
              matchups.map(async (rawMatchup) => {
                const matchupData = rawMatchup.toObject<MatchupData>();
                const matchup = await Matchup.fromData(matchupData);
                return matchup.toOpponent().toClient();
              })
            )
          );
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R3-01`);
        }
      },
      post: async function (req: Request, res: DraftResponse) {
        if (!req.auth!.payload.sub!) {
          return;
        }
        try {
          const opponent = Opponent.fromForm(req.body, res.ruleset!);
          const matchup = Matchup.fromForm(res.draft!, opponent);
          await createMatchup(matchup.toData());
          return res.status(201).json({ message: "Matchup Added" });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R3-02`);
        }
      },
    },
    "/:team_id/stats": {
      get: async function (req: Request, res: DraftResponse) {
        if (!res.draftOld || !res.ruleset) {
          return;
        }
        try {
          res.json(await getStats(res.ruleset, res.draftOld._id));
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R4-01`);
        }
      },
    },
    "/:team_id/archive": {
      delete: async function (req: Request, res: DraftResponse) {
        if (!res.draftOld || !res.rawDraft) {
          return;
        }
        const session = await startSession();
        session.startTransaction();
        try {
          const archive = new ArchiveOld(res.draftOld);
          const archiveData = await archive.createArchive();
          await deleteDraft(res.rawDraft);
          archiveData.save({ session });
          await session.commitTransaction();
          res.status(201).json({ message: "Archive added" });
        } catch (error) {
          await session.abortTransaction();
          return sendError(res, 500, error as Error, `${routeCode}-R5-01`);
        } finally {
          session.endSession();
        }
      },
    },
    "/:team_id/:matchup_id": {
      get: async function (req: Request, res: MatchupResponse) {
        try {
          return res.json(res.matchup!.toClient());
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R6-01`);
        }
      },
    },
    "/:team_id/:matchup_id/opponent": {
      get: async function (req: Request, res: MatchupResponse) {
        try {
          const opponent = res.matchup!.toOpponent();
          return res.json(opponent.toClient());
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R7-01`);
        }
      },
      patch: async function (req: Request, res: MatchupResponse) {
        try {
          const opponent = Opponent.fromForm(req.body, res.ruleset!);
          const updatedMatchup = await updateMatchup(
            req.params.matchup_id,
            opponent.toData()
          );
          clearMatchupCacheById(req.params.matchup_id);
          if (updatedMatchup) {
            return res
              .status(200)
              .json({ message: "Matchup Updated", draft: updatedMatchup });
          } else {
            return res
              .status(404)
              .json({
                message: "Matchup not found",
                code: `${routeCode}-R7-02`,
              });
          }
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R7-03`);
        }
      },
    },
    "/:team_id/:matchup_id/score": {
      patch: async function (req: Request, res: DraftResponse) {
        try {
          const score = new Score(req.body);
          const processedScore = await score.processScore();
          const updatedMatchup = await updateMatchup(req.params.matchup_id, {
            matches: processedScore.matches,
            "aTeam.paste": processedScore.aTeamPaste,
            "bTeam.paste": processedScore.bTeamPaste,
          });
          if (updatedMatchup) {
            return res
              .status(200)
              .json({ message: "Matchup Updated", draft: updatedMatchup });
          } else {
            return res
              .status(404)
              .json({
                message: "Matchup not found",
                code: `${routeCode}-R8-01`,
              });
          }
        } catch (error) {
          logger.error("Error updating matchup:", error);
          return sendError(res, 500, error as Error, `${routeCode}-R8-02`);
        }
      },
    },
    "/:team_id/:matchup_id/schedule": {
      get: async function (req: Request, res: MatchupResponse) {
        if (!res.draftOld) {
          return;
        }
        if (res.matchup) {
          return res.json({
            gameTime: res.matchup.gameTime,
            reminder: res.matchup.reminder,
          });
        } else {
          return sendError(
            res,
            500,
            new Error("Matchup not found"),
            `${routeCode}-R6-01`
          );
        }
      },
      patch: async function (req: Request, res: DraftResponse) {
        try {
          const time = new GameTime(req.body);
          const processedTime = await time.processTime();
          const updatedMatchup = await updateMatchup(req.params.matchup_id, {
            gameTime: processedTime.dateTime,
            reminder: processedTime.emailTime,
          });
          if (updatedMatchup) {
            return res
              .status(200)
              .json({ message: "Matchup Updated", draft: updatedMatchup });
          } else {
            return res
              .status(404)
              .json({
                message: "Matchup not found",
                code: `${routeCode}-R6-03`,
              });
          }
        } catch (error) {
          logger.error("Error updating matchup:", error);
          return sendError(res, 500, error as Error, `${routeCode}-R6-04`);
        }
      },
    },
  },
  params: {
    team_id: async function (req: Request, res: DraftResponse, next, team_id) {
      try {
        const rawDraft = await getDraft(team_id, req.auth!.payload.sub!);

        if (!rawDraft)
          return res
            .status(404)
            .json({
              message: "Team ID not found.",
              code: `${routeCode}-P1-02`,
            });
        res.rawDraft = rawDraft;
        res.draftOld = res.rawDraft.toObject<DraftData>();
        res.ruleset = getRuleset(rawDraft.ruleset);
        res.draft = Draft.fromData(rawDraft, res.ruleset);
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
      next();
    },
    matchup_id: async (
      req: Request,
      res: MatchupResponse,
      next,
      matchup_id
    ) => {
      try {
        if (!matchup_id)
          return res
            .status(400) // Bad Request
            .json({
              message: "Matchup ID not provided.",
              code: `${routeCode}-P1-01`,
            });
        const rawMatchup: MatchupDocument | null = await getMatchupById(
          matchup_id
        );
        if (!rawMatchup) {
          return res
            .status(404) // Not Found
            .json({
              message: "Matchup not found.",
              code: `${routeCode}-P1-02`,
            });
        }
        if (!res.draft) {
          return sendError(
            res,
            500,
            new Error("Draft not found in response locals."),
            `${routeCode}-P1-05`
          );
        }
        const matchup = rawMatchup.toObject<MatchupData>();
        res.matchup = await Matchup.fromData(matchup, res.draft);
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P1-04`);
      }
      next();
    },
  },
};
