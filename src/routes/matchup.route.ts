import express, { Request, Response } from "express";
import mongoose from "mongoose";
import { DraftSpecies } from "../classes/pokemon";
import { FormatId, Formats } from "../data/formats";
import { Ruleset, RulesetId, Rulesets } from "../data/rulesets";
import { DraftModel } from "../models/draft.model";
import {
  MatchupData,
  MatchupDocument,
  MatchupModel,
} from "../models/matchup.model";
import {
  Coveragechart,
  coveragechart,
} from "../services/matchup-services/coverage.service";
import {
  Movechart,
  movechart,
} from "../services/matchup-services/movechart.service";
import {
  Speedchart,
  speedchart,
} from "../services/matchup-services/speedchart.service";
import { Summary, summary } from "../services/matchup-services/summary.service";
import {
  Typechart,
  typechart,
} from "../services/matchup-services/typechart.service";

export const matchupRouter = express.Router();

interface MatchupResponse extends Response {
  rawMatchup?: MatchupDocument | null;
  matchup?: MatchupData & {
    format: FormatId;
    rulesetId: RulesetId;
    leagueName: string;
  };
  ruleset?: Ruleset;
}

matchupRouter
  .route("/:matchup_id")
  .get(async (req: Request, res: MatchupResponse) => {
    if (!res.matchup) {
      return;
    }
    try {
      let level = Formats[res.matchup.format].level;
      let data: {
        format: FormatId;
        ruleset: RulesetId;
        level: number;
        gameTime: string;
        stage: string;
        leagueName: string;
        summary: (Summary & { teamName?: string })[];
        speedchart: Speedchart;
        coveragechart: Coveragechart[];
        typechart: Typechart[];
        movechart: Movechart[];
      } = {
        format: res.matchup.format,
        ruleset: res.matchup.rulesetId,
        level: level,
        gameTime: res.matchup.gameTime || "",
        stage: res.matchup.stage,
        leagueName: res.matchup.leagueName,
        summary: [],
        speedchart: speedchart(
          [res.matchup.aTeam.team, res.matchup.bTeam.team],
          level
        ),
        coveragechart: [
          await coveragechart(res.matchup.aTeam.team, res.matchup.bTeam.team),
          await coveragechart(res.matchup.bTeam.team, res.matchup.aTeam.team),
        ],
        typechart: [
          typechart(res.matchup.aTeam.team),
          typechart(res.matchup.bTeam.team),
        ],
        movechart: [
          await movechart(res.matchup.aTeam.team),
          await movechart(res.matchup.bTeam.team),
        ],
      };
      let aTeamsummary: Summary & { teamName?: string } = summary(
        res.matchup.aTeam.team
      );
      let bTeamsummary: Summary & { teamName?: string } = summary(
        res.matchup.bTeam.team
      );
      aTeamsummary.teamName = res.matchup.aTeam.teamName;
      bTeamsummary.teamName = res.matchup.bTeam.teamName;
      data.summary = [aTeamsummary, bTeamsummary];
      res.json(data);
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-R1-01" });
    }
  })
  .delete(async (req: Request, res: MatchupResponse) => {
    if (!res.matchup || !res.rawMatchup) {
      return;
    }
    try {
      await res.rawMatchup.deleteOne();
      res.json({ message: "Matchup deleted" });
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-R1-02" });
    }
  });

matchupRouter.get(
  "/:matchup_id/summary",
  async (req: Request, res: MatchupResponse) => {
    if (!res.matchup || !res.rawMatchup) {
      return;
    }
    try {
      let aTeamsummary: Summary & { teamName?: string } = summary(
        res.matchup.aTeam.team
      );
      let bTeamsummary: Summary & { teamName?: string } = summary(
        res.matchup.bTeam.team
      );
      aTeamsummary.teamName = res.matchup.aTeam.teamName;
      bTeamsummary.teamName = res.matchup.bTeam.teamName;
      res.json([aTeamsummary, bTeamsummary]);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-R2-02" });
    }
  }
);

matchupRouter.get(
  "/:matchup_id/typechart",
  async (req: Request, res: MatchupResponse) => {
    if (!res.matchup || !res.rawMatchup) {
      return;
    }
    try {
      res.json([
        typechart(res.matchup.aTeam.team),
        typechart(res.matchup.bTeam.team),
      ]);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-R3-01" });
    }
  }
);

matchupRouter.get(
  "/:matchup_id/speedchart",
  async (req: Request, res: MatchupResponse) => {
    if (!res.matchup) {
      return;
    }
    try {
      let level = Formats[res.matchup.format].level;
      res.json(
        speedchart([res.matchup.aTeam.team, res.matchup.bTeam.team], level)
      );
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-R4-01" });
    }
  }
);

matchupRouter.get(
  "/:matchup_id/coveragechart",
  async (req: Request, res: MatchupResponse) => {
    if (!res.matchup) {
      return;
    }
    try {
      res.json([
        coveragechart(res.matchup.aTeam.team, res.matchup.bTeam.team),
        coveragechart(res.matchup.bTeam.team, res.matchup.aTeam.team),
      ]);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-R5-01" });
    }
  }
);

matchupRouter.get(
  "/:matchup_id/movechart",
  async (req: Request, res: MatchupResponse) => {
    if (!res.matchup) {
      return;
    }
    try {
      res.json([
        movechart(res.matchup.aTeam.team),
        movechart(res.matchup.bTeam.team),
      ]);
    } catch (error) {
      res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-R6-01" });
    }
  }
);

matchupRouter.param(
  "matchup_id",
  async (req: Request, res: MatchupResponse, next, matchup_id) => {
    try {
      if (mongoose.Types.ObjectId.isValid(matchup_id)) {
        res.rawMatchup = await MatchupModel.findById(matchup_id);
        let matchup: MatchupData | undefined = res.rawMatchup?.toObject();
        if (matchup === undefined) {
          res
            .status(400)
            .json({ message: "Matchup ID not found", code: "MR-P1-01" });
          return next();
        }
        const aTeam = await DraftModel.findById(matchup.aTeam._id).lean();
        if (aTeam === null) {
          res
            .status(400)
            .json({ message: "Draft ID not found", code: "MR-P1-02" });
          return next();
        }
        res.matchup = {
          ...matchup,
          leagueName: aTeam.leagueName,
          format: aTeam.format as FormatId,
          rulesetId: aTeam.ruleset,
        };
        res.ruleset = Rulesets[res.matchup.rulesetId];
        if (res.ruleset === undefined) {
          return res
            .status(400)
            .json({ message: "Invalid ruleset ID", code: "MR-P1-03" });
        }
        res.matchup.aTeam = {
          owner: aTeam.owner,
          teamName: aTeam.teamName,
          team: aTeam.team.map((pokemon: any) => {
            let specie = res.ruleset!.gen.species.get(pokemon.pid);
            if (!specie) throw new Error(`Invalid id: ${pokemon.pid}`);
            let draftSpecies: DraftSpecies = new DraftSpecies(
              specie,
              pokemon,
              res.ruleset!
            );
            return draftSpecies;
          }),
          _id: aTeam._id,
        };

        res.matchup.bTeam.team = res.matchup.bTeam.team.map((pokemon: any) => {
          let specie = res.ruleset!.gen.species.get(pokemon.pid);
          if (!specie) throw new Error(`Invalid id: ${pokemon.pid}`);
          let draftSpecies: DraftSpecies = new DraftSpecies(
            specie,
            pokemon,
            res.ruleset!
          );
          return draftSpecies;
        });
      } else {
        return res
          .status(400)
          .json({ message: "Invalid ID format", code: "MR-P1-04" });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ message: (error as Error).message, code: "MR-P1-05" });
    }
    next();
  }
);
