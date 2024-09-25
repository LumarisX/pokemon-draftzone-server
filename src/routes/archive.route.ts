import { Response } from "express";
import mongoose from "mongoose";
import { getSub, jwtCheck, Route, SubRequest } from ".";
import { getRuleset, Ruleset } from "../data/rulesets";
import { ArchiveModel } from "../models/archive.model";
import { DraftDocument } from "../models/draft.model";
import { MatchupDocument } from "../models/matchup.model";
import { getName } from "../services/data-services/pokedex.service";

export type ArchiveResponse = Response & {
  rawArchive?: DraftDocument | null;
  rawMatchup?: MatchupDocument | null;
  archive?: DraftDocument;
  ruleset?: Ruleset;
  matchup?: MatchupDocument;
};

export const ArchiveRoutes: Route = {
  middleware: [jwtCheck, getSub],
  subpaths: {
    "/teams": {
      get: async (req: SubRequest, res: ArchiveResponse) => {
        try {
          let archives = await ArchiveModel.find({ owner: req.sub }).sort({
            createdAt: -1,
          });
          archives = archives.map((rawArchive) => {
            let archive = rawArchive.toObject();
            archive.team = archive.team.map((mon) => ({
              id: mon.id,
              name: getName(mon.id),
            }));
            return archive;
          });
          res.json(archives);
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "AR-R1-01" });
        }
      },
    },
    "/:team_id": {
      delete: async (req: SubRequest, res: ArchiveResponse) => {
        if (!res.rawArchive) {
          return;
        }
        try {
          await res.rawArchive.deleteOne();
          res.status(201).json({ message: "Draft deleted" });
        } catch (error) {
          console.error("Error deleting draft:", error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "AR-R2-04" });
        }
      },
    },
    "/:team_id/stats": {
      get: async (req: SubRequest, res: ArchiveResponse) => {
        if (!res.archive || !res.ruleset) {
          return;
        }
        try {
        } catch (error) {
          res.status(500).json({ message: (error as Error).message });
        }
      },
    },
  },
  params: {
    team_id: async (req: SubRequest, res: ArchiveResponse, next, team_id) => {
      try {
        if (mongoose.Types.ObjectId.isValid(team_id)) {
          res.rawArchive = await ArchiveModel.findById(team_id);
        }
        if (res.rawArchive == null) {
          return res
            .status(400)
            .json({ message: "Archive ID not found", code: "AR-P1-02" });
        }
        res.archive = res.rawArchive.toObject();
        res.ruleset = getRuleset(res.archive!.ruleset);
      } catch (error) {
        console.log(error);
        return res
          .status(500)
          .json({ message: (error as Error).message, code: "DR-P2-02" });
      }
      next();
    },
  },
};
