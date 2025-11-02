import { Request, Response } from "express";
import mongoose from "mongoose";
import { Route } from ".";
import { getRuleset, Ruleset } from "../data/rulesets";
import { jwtCheck } from "../middleware/jwtcheck";
import { MatchupDocument } from "../models/draft/matchup.model";
import { getName } from "../services/data-services/pokedex.service";
import { getStats } from "../services/database-services/archive.service";
import {
  ArchiveBaseModel,
  ArchiveV1Data,
  ArchiveV1Document,
  ArchiveV2Data,
  ArchiveV2Document,
} from "../models/draft/archive.model";

export type ArchiveResponse = Response & {
  rawArchive?: ArchiveV1Document | ArchiveV2Document | null;
  rawMatchup?: MatchupDocument | null;
  archive?: ArchiveV1Data | ArchiveV2Data;
  ruleset?: Ruleset;
  matchup?: MatchupDocument;
};

export const ArchiveRoutes: Route = {
  middleware: [jwtCheck],
  subpaths: {
    "/teams": {
      get: async (req: Request, res: ArchiveResponse) => {
        try {
          let rawArchives = await ArchiveBaseModel.find({
            owner: req.auth!.payload.sub!,
          }).sort({
            createdAt: -1,
          });
          let archives = rawArchives.map((rawArchive) => {
            let archive = rawArchive.toObject();
            return {
              ...archive,
              team: archive.team.map((pokemon) => ({
                ...pokemon,
                name: getName(pokemon.id),
              })),
            };
          });
          res.json(archives);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "AR-R1-01" });
        }
      },
    },
    "/:team_id": {
      delete: async (req: Request, res: ArchiveResponse) => {
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
      get: async (req: Request, res: ArchiveResponse) => {
        if (!res.archive || !res.ruleset) return;
        try {
          res.json(await getStats(res.ruleset!, res.archive));
        } catch (error) {
          console.error(error);
          res.status(500).json({ message: (error as Error).message });
        }
      },
    },
  },
  params: {
    team_id: async (req: Request, res: ArchiveResponse, next, team_id) => {
      try {
        if (mongoose.Types.ObjectId.isValid(team_id)) {
          res.rawArchive = await ArchiveBaseModel.findById(team_id);
        }
        if (res.rawArchive == null) {
          return res
            .status(400)
            .json({ message: "Archive ID not found", code: "AR-P1-02" });
        }
        res.archive = res.rawArchive.toObject();
        res.ruleset = getRuleset(res.archive!.ruleset);
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ message: (error as Error).message, code: "DR-P2-02" });
      }
      next();
    },
  },
};
