import express, { Response } from "express";
import mongoose from "mongoose";
import { SubRequest } from "../app";
import { Archive } from "../classes/archive";
import { Draft } from "../classes/draft";
import { GameTime, Matchup, Score } from "../classes/matchup";
import { DraftSpecies } from "../classes/pokemon";
import { getRuleset, Ruleset } from "../data/rulesets";
import { DraftDocument, DraftModel } from "../models/draft.model";
import { MatchupDocument, MatchupModel } from "../models/matchup.model";
import { getName } from "../services/data-services/pokedex.service";
import {
  getScore,
  getStats,
} from "../services/database-services/draft.services";

export const draftRouter = express.Router();

type DraftResponse = Response & {
  rawDraft?: DraftDocument | null;
  rawMatchup?: MatchupDocument | null;
  draft?: DraftDocument;
  ruleset?: Ruleset;
  matchup?: MatchupDocument;
};

draftRouter
  .route("/teams")
  .get(async (req: SubRequest, res: DraftResponse) => {
    try {
      res.json(
        await DraftModel.find({ owner: req.sub }).sort({ createdAt: -1 })
      );
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R1-01" });
    }
  })
  .post(async (req: SubRequest, res: DraftResponse) => {
    if (!req.sub) {
      return;
    }
    try {
      const draft = new Draft(req.body, req.sub);
      const draftDoc = await draft.createDraft();
      const foundDrafts = await DraftModel.find({
        owner: req.sub,
        leagueId: draftDoc.leagueId,
      });
      if (foundDrafts.length > 0) {
        res
          .status(400)
          .json({ message: "Draft ID already exists", code: "DR-R1-02" });
      } else {
        await draftDoc.save();
        res.status(201).json({ message: "Draft Added" });
      }
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R1-03" });
    }
  });

draftRouter
  .route("/:team_id")
  .get(async (req: SubRequest, res: DraftResponse) => {
    if (!res.draft) {
      return;
    }
    try {
      res.draft.score = await getScore(res.draft._id);
      res.json(res.draft);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R2-01" });
    }
  })
  .patch(async (req: SubRequest, res: DraftResponse) => {
    if (!req.sub) {
      return;
    }
    try {
      let team_id = req.params.team_id;
      const draft = await new Draft(req.body, req.sub).createDraft();

      const updatedDraft = await DraftModel.findOneAndUpdate(
        { owner: req.sub, leagueId: team_id },
        {
          teamName: draft.teamName,
          leagueName: draft.leagueName,
          team: draft.team,
          format: draft.format,
          ruleset: draft.ruleset,
        },
        { new: true, upsert: true }
      );

      if (updatedDraft) {
        res.status(200).json({ message: "Draft Updated", draft: updatedDraft });
      } else {
        res.status(404).json({ message: "Draft not found", code: "DR-R2-02" });
      }
    } catch (error) {
      console.error("Error updating draft:", error);
      res
        .status(500)
        .json({ message: "Internal Server Error", code: "DR-R2-03" });
    }
  })
  .delete(async (req: SubRequest, res: DraftResponse) => {
    if (!res.rawDraft) {
      return;
    }
    try {
      await res.rawDraft.deleteOne();
      res.status(201).json({ message: "Draft deleted" });
    } catch (error) {
      console.error("Error deleting draft:", error);
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R2-04" });
    }
  });

draftRouter
  .route("/:team_id/matchups")
  .get(async (req: SubRequest, res: DraftResponse) => {
    if (!res.draft) {
      return;
    }
    try {
      let matchups = await MatchupModel.find({
        "aTeam._id": res.draft._id,
      }).sort({
        createdAt: -1,
      });
      res.json(matchups);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R3-01" });
    }
  })
  .post(async (req: SubRequest, res: DraftResponse) => {
    if (!res.draft) {
      return;
    }
    try {
      const matchup = new Matchup(res.ruleset!, req.body, res.draft._id);
      (await matchup.createMatchup()).save();
      res.status(201).json({ message: "Matchup Added" });
    } catch (error) {
      console.error("Error saving matchup:", error);
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R3-02" });
    }
  });

draftRouter
  .route("/:team_id/stats")
  .get(async (req: SubRequest, res: DraftResponse) => {
    if (!res.draft || !res.ruleset) {
      return;
    }
    try {
      res.json(await getStats(res.ruleset, res.draft._id));
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
    }
  });

draftRouter
  .route("/:team_id/archive")
  .delete(async (req: SubRequest, res: DraftResponse) => {
    if (!res.draft || !res.rawDraft) {
      return;
    }
    try {
      const archive = new Archive(res.draft);
      const archiveData = await archive.createArchive();
      await res.rawDraft.deleteOne();
      archiveData.save();
      res.status(201).json({ message: "Archive added" });
    } catch (error) {
      console.error("Error handling archive:", error);
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R4-01" });
    }
  });

draftRouter
  .route("/:team_id/:matchup_id")
  .get(async (req: SubRequest, res: DraftResponse) => {
    try {
      res.json(res.matchup);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R5-01" });
    }
  })
  .patch(async (req: SubRequest, res: DraftResponse) => {
    if (!res.draft) {
      return;
    }
    try {
      const matchup = new Matchup(res.ruleset!, req.body, res.draft._id);
      const matchupDoc = await matchup.createMatchup();
      const updatedMatchup = await MatchupModel.findByIdAndUpdate(
        req.params.matchup_id,
        {
          "bTeam.teamName": matchupDoc.bTeam.teamName,
          stage: matchupDoc.stage,
          "bTeam.team": matchupDoc.bTeam.team,
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
          .json({ message: "Matchup not found", code: "DR-R5-02" });
      }
    } catch (error) {
      console.error("Error updating matchup:", error);
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R5-03" });
    }
  });

draftRouter
  .route("/:team_id/:matchup_id/score")
  .patch(async (req: SubRequest, res: DraftResponse) => {
    try {
      const score = new Score(req.body);
      const processedScore = await score.processScore();
      const updatedMatchup = await MatchupModel.findByIdAndUpdate(
        req.params.matchup_id,
        {
          matches: processedScore.matches,
          "aTeam.paste": processedScore.aTeamPaste,
          "bteam.paste": processedScore.bTeamPaste,
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
          .json({ message: "Matchup not found", code: "DR-R6-01" });
      }
    } catch (error) {
      console.error("Error updating matchup:", error);
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R6-02" });
    }
  });

draftRouter
  .route("/:team_id/:matchup_id/schedule")
  .get(async (req: SubRequest, res: DraftResponse) => {
    if (!res.draft) {
      return;
    }
    try {
      if (res.matchup) {
        res.json({
          gameTime: res.matchup.gameTime,
          reminder: res.matchup.reminder,
        });
      } else {
        res
          .status(500)
          .json({ message: "Matchup not found", code: "DR-R6-01" });
      }
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-R6-02" });
    }
  })
  .patch(async (req: SubRequest, res: DraftResponse) => {
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
  });

draftRouter.param(
  "team_id",
  async (req: SubRequest, res: DraftResponse, next, team_id) => {
    try {
      let user_id = await req.sub;
      if (mongoose.Types.ObjectId.isValid(team_id)) {
        res.rawDraft = await DraftModel.findById(team_id);
      } else {
        let drafts = await DraftModel.find({
          owner: user_id,
          leagueId: team_id,
        });
        res.rawDraft = drafts[0];
      }
      if (res.rawDraft == null) {
        return res
          .status(400)
          .json({ message: "Team id not found", code: "DR-P1-02" });
      }
      res.draft = res.rawDraft.toObject();
      res.ruleset = getRuleset(res.draft.ruleset);
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-P2-02" });
    }
    next();
  }
);

draftRouter.param(
  "matchup_id",
  async (req: SubRequest, res: DraftResponse, next, matchup_id) => {
    try {
      if (matchup_id == null) {
        return res
          .status(400)
          .json({ message: "Team id not found", code: "DR-P1-01" });
      }
      const rawMatchup = await MatchupModel.findById(matchup_id);
      const matchup = rawMatchup?.toObject();
      if (!matchup) {
        res
          .status(400)
          .json({ message: "Matchup ID not found", code: "DR-P1-02" });
        next();
        return;
      }
      const draft = await DraftModel.findById(matchup.aTeam._id);
      if (draft === null) {
        res
          .status(400)
          .json({ message: "Matchup ID not found", code: "DR-P1-03" });
        next();
        return;
      }
      matchup.aTeam.teamName = draft.teamName;
      matchup.aTeam.team = draft.team.map((pokemon: any) => {
        let specie = res.ruleset!.gen.species.get(pokemon.id);
        if (!specie) throw new Error(`Invalid id: ${pokemon.id}`);
        let draftSpecies: DraftSpecies = new DraftSpecies(
          specie,
          pokemon,
          res.ruleset!
        );
        return draftSpecies;
      });

      res.matchup = matchup;
    } catch (error) {
      return res
        .status(500)
        .json({ message: (error as Error).message, code: "DR-P1-04" });
    }
    next();
  }
);
