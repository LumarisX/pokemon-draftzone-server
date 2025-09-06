import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { jwtCheck, Route, sendError } from ".";
import { ArchiveOld } from "../classes/archive";
import { Draft } from "../classes/draft";
import { GameTime, Matchup, Score } from "../classes/matchup";
import { Opponent } from "../classes/opponent";
import { getRuleset, Ruleset } from "../data/rulesets";
import { DraftData, DraftDocument, DraftModel } from "../models/draft.model";
import {
  MatchupData,
  MatchupDocument,
  MatchupModel,
} from "../models/matchup.model";
import {
  getScore,
  getStats,
} from "../services/database-services/draft.services";
import { $matchups } from "./matchup.route";

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
          const drafts = await DraftModel.find({
            owner: req.auth!.payload.sub!,
          }).sort({
            createdAt: -1,
          });

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
          const draftDoc = new DraftModel(draft.toData());
          const foundDrafts = await DraftModel.find({
            owner: req.auth!.payload.sub!,
            leagueId: draftDoc.leagueId,
          });
          if (foundDrafts.length > 0)
            return res
              .status(409)
              .json({
                message: "A draft with this league name already exists.",
                code: "DR-R1-02",
              });
          await draftDoc.save();
          return res.status(201).json({ message: "Draft Added" });
        } catch (error) {
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
      patch: async function (req: Request, res: DraftResponse) {
        if (!req.auth!.payload.sub!) return;
        try {
          const draft = Draft.fromForm(
            req.body,
            req.auth!.payload.sub!
          ).toData();
          const updatedDraft = await DraftModel.findOneAndUpdate(
            { owner: req.auth!.payload.sub!, leagueId: req.params.team_id },
            draft,
            { new: true, upsert: true }
          );
          if (updatedDraft) {
            $matchups
              .keys()
              .filter((key: string) =>
                key.startsWith(updatedDraft._id.toString())
              )
              .forEach((key: any) => $matchups.del(key));
            return res
              .status(200)
              .json({ message: "Draft Updated", draft: updatedDraft });
          }
          return res
            .status(404)
            .json({ message: "Draft not found", code: "DR-R2-02" });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-03`);
        }
      },
      delete: async function (req: Request, res: DraftResponse) {
        if (!res.rawDraft) {
          return;
        }
        try {
          await res.rawDraft.deleteOne();
          res.status(201).json({ message: "Draft deleted" });
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
          console.log(this);
          return sendError(res, 500, error as Error, `${routeCode}-R3-01`);
        }
      },
      post: async function (req: Request, res: DraftResponse) {
        try {
          const opponent = Opponent.fromForm(req.body, res.ruleset!);
          const matchup = Matchup.fromForm(res.draft!, opponent);
          const doc: MatchupDocument = new MatchupModel(matchup.toData());
          const response = await doc.save();
          res.status(201).json({ message: "Matchup Added" });
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
          res.status(500).json({ message: (error as Error).message });
          return sendError(res, 500, error as Error, `${routeCode}-R4-01`);
        }
      },
    },
    "/:team_id/archive": {
      delete: async function (req: Request, res: DraftResponse) {
        if (!res.draftOld || !res.rawDraft) {
          return;
        }
        try {
          const archive = new ArchiveOld(res.draftOld);
          const archiveData = await archive.createArchive();
          await res.rawDraft.deleteOne();
          archiveData.save();
          res.status(201).json({ message: "Archive added" });
        } catch (error) {
          console.error("Error handling archive:", error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R5-01" });
        }
      },
    },
    "/:team_id/:matchup_id": {
      get: async function (req: Request, res: MatchupResponse) {
        try {
          res.json(res.matchup!.toClient());
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R6-01" });
        }
      },
    },
    "/:team_id/:matchup_id/opponent": {
      get: async function (req: Request, res: MatchupResponse) {
        try {
          console.log(res.matchup);
          const opponent = res.matchup!.toOpponent();
          res.json(opponent.toClient());
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R7-01" });
        }
      },
      patch: async function (req: Request, res: MatchupResponse) {
        if (!res.draftOld) return;
        try {
          const opponent = Opponent.fromForm(req.body, res.ruleset!);
          const updatedMatchup = await MatchupModel.findByIdAndUpdate(
            req.params.matchup_id,
            opponent.toData(),
            { new: true, upsert: true }
          );
          $matchups.del(`${res.draftOld._id}-${req.params.matchup_id}`);
          if (updatedMatchup) {
            res
              .status(200)
              .json({ message: "Matchup Updated", draft: updatedMatchup });
          } else {
            res
              .status(404)
              .json({ message: "Matchup not found", code: "DR-R7-02" });
          }
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R7-03`);
        }
      },
    },
    "/:team_id/:matchup_id/score": {
      patch: async function (req: Request, res: DraftResponse) {
        try {
          console.log(req.body);
          const score = new Score(req.body);
          const processedScore = await score.processScore();
          const updatedMatchup = await MatchupModel.findByIdAndUpdate(
            req.params.matchup_id,
            {
              matches: processedScore.matches,
              "aTeam.paste": processedScore.aTeamPaste,
              "bTeam.paste": processedScore.bTeamPaste,
            },
            { new: true, upsert: true }
          );
          if (updatedMatchup) {
            res
              .status(200)
              .json({ message: "Matchup Updated", draft: updatedMatchup });
          } else {
            res
              .status(404)
              .json({ message: "Matchup not found", code: "DR-R8-01" });
          }
        } catch (error) {
          console.error("Error updating matchup:", error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R8-02" });
        }
      },
    },
    "/:team_id/:matchup_id/schedule": {
      get: async function (req: Request, res: MatchupResponse) {
        if (!res.draftOld) {
          return;
        }
        try {
          // if (res.matchup) {
          //   res.json({
          //     gameTime: res.matchup.gameTime,
          //     reminder: res.matchup.reminder,
          //   });
          // } else {
          //   res
          //     .status(500)
          //     .json({ message: "Matchup not found", code: "DR-R6-01" });
          // }
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R9-02" });
        }
      },
      patch: async function (req: Request, res: DraftResponse) {
        try {
          const time = new GameTime(req.body);
          const processedTime = await time.processTime();
          const updatedMatchup = await MatchupModel.findByIdAndUpdate(
            req.params.matchup_id,
            {
              gameTime: processedTime.dateTime,
              reminder: processedTime.emailTime,
            },
            { new: true, upsert: true }
          );
          if (updatedMatchup) {
            res
              .status(200)
              .json({ message: "Matchup Updated", draft: updatedMatchup });
          } else {
            res
              .status(404)
              .json({ message: "Matchup not found", code: "DR-R6-03" });
          }
        } catch (error) {
          console.error("Error updating matchup:", error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R6-04" });
        }
      },
    },
  },
  params: {
    team_id: async function (req: Request, res: DraftResponse, next, team_id) {
      try {
        let user_id = req.auth!.payload.sub!;
        const rawDraft: DraftDocument | null = mongoose.Types.ObjectId.isValid(
          team_id
        )
          ? await DraftModel.findById(team_id)
          : (
              await DraftModel.find({
                owner: user_id,
                leagueId: team_id,
              })
            )[0];

        if (!rawDraft)
          return res
            .status(404)
            .json({ message: "Team ID not found.", code: "DR-P1-02" });
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
            .json({ message: "Matchup ID not provided.", code: "DR-P1-01" });
        const rawMatchup: MatchupDocument | null = await MatchupModel.findById(
          matchup_id
        );
        if (!rawMatchup) {
          return res
            .status(404) // Not Found
            .json({ message: "Matchup not found.", code: "DR-P1-02" });
        }
        const matchup = rawMatchup.toObject<MatchupData>();
        res.matchup = await Matchup.fromData(matchup, res.draft!);
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P1-04`);
      }
      next();
    },
  },
};
