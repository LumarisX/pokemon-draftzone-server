import express, { Response } from "express";
import mongoose from "mongoose";
import { SubRequest } from "../app";
import { Ruleset, Rulesets } from "../data/rulesets";
import { ArchiveModel } from "../models/archive.model";
import { DraftDocument } from "../models/draft.model";
import { MatchupDocument } from "../models/matchup.model";
import { getName } from "../services/data-services/pokedex.service";

export const archiveRouter = express.Router();

type ArchiveResponse = Response & {
  rawArchive?: DraftDocument | null;
  rawMatchup?: MatchupDocument | null;
  archive?: DraftDocument;
  ruleset?: Ruleset;
  matchup?: MatchupDocument;
};

archiveRouter
  .route("/teams")
  .get(async (req: SubRequest, res: ArchiveResponse) => {
    try {
      let archives = await ArchiveModel.find({ owner: req.sub }).sort({
        createdAt: -1,
      });
      archives = archives.map((rawArchive) => {
        let archive = rawArchive.toObject();
        archive.team = archive.team.map((mon) => ({
          pid: mon.pid,
          name: getName(Rulesets[archive.ruleset], mon.pid),
        }));
        return archive;
      });
      res.json(archives);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R1-01" });
    }
  });

archiveRouter
  .route("/:team_id")
  .delete(async (req: SubRequest, res: ArchiveResponse) => {
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
        .json({ message: (error as Error).message, code: "DR-R2-04" });
    }
  });

archiveRouter
  .route("/:team_id/stats")
  .get(async (req: SubRequest, res: ArchiveResponse) => {
    if (!res.archive || !res.ruleset) {
      return;
    }
    try {
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
    }
  });

archiveRouter.param(
  "team_id",
  async (req: SubRequest, res: ArchiveResponse, next, team_id) => {
    try {
      if (mongoose.Types.ObjectId.isValid(team_id)) {
        res.rawArchive = await ArchiveModel.findById(team_id);
      }
      if (res.rawArchive == null) {
        return res
          .status(400)
          .json({ message: "Archive ID not found", code: "DR-P1-02" });
      }
      res.archive = res.rawArchive.toObject();
      res.ruleset = Rulesets[res.archive.ruleset];
      for (let pokemon of res.archive.team) {
        pokemon.name = getName(res.ruleset, pokemon.pid);
      }
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-P2-02" });
    }
    next();
  }
);
