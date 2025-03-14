import { Response } from "express";
import mongoose from "mongoose";
import { getSub, jwtCheck, Route, SubRequest } from ".";
import { Archive } from "../classes/archive";
import { Draft } from "../classes/draft";
import { GameTime, Matchup, Score } from "../classes/matchup";
import { DraftSpecies } from "../classes/pokemon";
import { getRuleset, Ruleset } from "../data/rulesets";
import { DraftData, DraftDocument, DraftModel } from "../models/draft.model";
import { MatchupDocument, MatchupModel } from "../models/matchup.model";
import { getName } from "../services/data-services/pokedex.service";
import {
  getScore,
  getStats,
} from "../services/database-services/draft.services";
import { $matchups } from "./matchup.route";

type DraftResponse = Response & {
  rawDraft?: DraftDocument | null;
  rawMatchup?: MatchupDocument | null;
  draft?: DraftDocument;
  ruleset?: Ruleset;
  matchup?: MatchupDocument;
};

export const DraftRoutes: Route = {
  middleware: [jwtCheck, getSub],
  subpaths: {
    "/teams": {
      get: async (req: SubRequest, res: DraftResponse) => {
        try {
          let drafts = await DraftModel.find({ owner: req.sub }).sort({
            createdAt: -1,
          });
          res.json(
            drafts.map((rawDraft) => {
              let draft = rawDraft.toObject();
              return {
                ...draft,
                team: draft.team.map((pokemon) => ({
                  ...pokemon,
                  name: getName(pokemon.id),
                })),
              };
            })
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R1-01" });
        }
      },
      post: async (req: SubRequest, res: DraftResponse) => {
        if (!req.sub) {
          return;
        }
        try {
          const draft = new Draft(req.body, req.sub);
          const draftDoc = await draft.toDocument();
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
      },
    },
    "/:team_id": {
      get: async (req: SubRequest, res: DraftResponse) => {
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
      },
      patch: async (req: SubRequest, res: DraftResponse) => {
        if (!req.sub) return;
        try {
          let team_id = req.params.team_id;
          const draft = await new Draft(req.body, req.sub).toDocument();
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
            $matchups
              .keys()
              .filter((key: string) =>
                key.startsWith(updatedDraft._id.toString())
              )
              .forEach((key: any) => $matchups.del(key));
            res
              .status(200)
              .json({ message: "Draft Updated", draft: updatedDraft });
          } else {
            res
              .status(404)
              .json({ message: "Draft not found", code: "DR-R2-02" });
          }
        } catch (error) {
          console.error("Error updating draft:", error);
          res
            .status(500)
            .json({ message: "Internal Server Error", code: "DR-R2-03" });
        }
      },
      delete: async (req: SubRequest, res: DraftResponse) => {
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
      },
    },
    "/:team_id/matchups": {
      get: async (req: SubRequest, res: DraftResponse) => {
        if (!res.draft) {
          return;
        }
        try {
          let matchups = await MatchupModel.find({
            "aTeam._id": res.draft._id,
          }).sort({
            createdAt: -1,
          });
          res.json(
            matchups.map((rawMatchup) => {
              let matchup = rawMatchup.toObject();
              return {
                ...matchup,
                bTeam: {
                  ...matchup.bTeam,
                  team: matchup.bTeam.team.map((pokemon) => ({
                    ...pokemon,
                    name: getName(pokemon.id),
                  })),
                },
              };
            })
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R3-01" });
        }
      },
      post: async (req: SubRequest, res: DraftResponse) => {
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
      },
    },
    "/:team_id/stats": {
      get: async (req: SubRequest, res: DraftResponse) => {
        if (!res.draft || !res.ruleset) {
          return;
        }
        try {
          res.json(await getStats(res.ruleset, res.draft._id));
        } catch (error) {
          res.status(500).json({ message: (error as Error).message });
        }
      },
    },
    "/:team_id/archive": {
      delete: async (req: SubRequest, res: DraftResponse) => {
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
      },
    },
    "/:team_id/:matchup_id": {
      get: async (req: SubRequest, res: DraftResponse) => {
        try {
          //poor way of doing this
          res.json({
            ...res.matchup,
            aTeam: {
              ...res.matchup!.aTeam,
              team: res.matchup!.aTeam.team.map((pokemon: any) => ({
                id: pokemon.id,
                name: pokemon.name,
                capt: pokemon.capt,
                shiny: pokemon.shiny,
              })),
            },
            bTeam: {
              ...res.matchup!.bTeam,
              team: res.matchup!.bTeam.team.map((pokemon: any) => ({
                id: pokemon.id,
                name: pokemon.name,
                capt: pokemon.capt,
                shiny: pokemon.shiny,
              })),
            },
          });
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DR-R5-01" });
        }
      },

      patch: async (req: SubRequest, res: DraftResponse) => {
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
          $matchups.del(`${res.draft._id}-${req.params.matchup_id}`);
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
      },
    },
    "/:team_id/:matchup_id/score": {
      patch: async (req: SubRequest, res: DraftResponse) => {
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
      },
    },
    "/:team_id/:matchup_id/schedule": {
      get: async (req: SubRequest, res: DraftResponse) => {
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
      },
      patch: async (req: SubRequest, res: DraftResponse) => {
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
    team_id: async (req: SubRequest, res: DraftResponse, next, team_id) => {
      try {
        let user_id = req.sub;
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
        let draft: DraftData = res.rawDraft.toObject();
        draft = {
          ...draft,
          team: draft.team.map((pokemon) => ({
            ...pokemon,
            name: getName(pokemon.id),
          })),
        };
        res.draft = draft as DraftDocument;
        res.ruleset = getRuleset(res.draft!.ruleset);
      } catch (error) {
        console.log(error);
        return res
          .status(500)
          .json({ message: (error as Error).message, code: "DR-P2-02" });
      }
      next();
    },
    matchup_id: async (
      req: SubRequest,
      res: DraftResponse,
      next,
      matchup_id
    ) => {
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
          let specie = res.ruleset!.dex.species.get(pokemon.id);
          if (!specie) throw new Error(`Invalid id: ${pokemon.id}`);
          let draftSpecies: DraftSpecies = new DraftSpecies(
            specie,
            pokemon,
            res.ruleset!
          );
          return draftSpecies;
        });
        matchup.bTeam.team = matchup.bTeam.team.map((pokemon) => {
          let specie = res.ruleset!.dex.species.get(pokemon.id);
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
    },
  },
};
