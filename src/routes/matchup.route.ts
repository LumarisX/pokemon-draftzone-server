import express, { Request, Response } from "express";
import mongoose from "mongoose";
import { FormatId, Formats } from "../data/formats";
import { RulesetId, Rulesets } from "../data/rulesets";
import { DraftModel } from "../models/draft.model";
import {
  MatchupData,
  MatchupDocument,
  MatchupModel,
} from "../models/matchup.model";
import { getName } from "../services/data-services/pokedex.service";
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
    ruleset: RulesetId;
    leagueName: string;
  };
}

matchupRouter
  .route("/:matchup_id")
  .get(async (req: Request, res: MatchupResponse) => {
    if (!res.matchup) {
      return;
    }
    try {
      let level = Formats[res.matchup.format].level;
      let gen = Rulesets[res.matchup.ruleset].gen;
      let data: {
        format: FormatId;
        ruleset: RulesetId;
        level: number;
        stage: string;
        leagueName: string;
        summary: (Summary & { teamName?: string })[];
        speedchart: Speedchart;
        coveragechart: Coveragechart[];
        typechart: Typechart[];
        movechart: Movechart[];
      } = {
        format: res.matchup.format,
        ruleset: res.matchup.ruleset,
        level: level,
        stage: res.matchup.stage,
        leagueName: res.matchup.leagueName,
        summary: [],
        speedchart: speedchart(
          [res.matchup.aTeam.team, res.matchup.bTeam.team],
          level
        ),
        coveragechart: [
          coveragechart(res.matchup.aTeam.team, res.matchup.bTeam.team, gen),
          coveragechart(res.matchup.bTeam.team, res.matchup.aTeam.team, gen),
        ],
        typechart: [
          typechart(res.matchup.aTeam.team),
          typechart(res.matchup.bTeam.team),
        ],
        movechart: [
          movechart(res.matchup.aTeam.team, gen),
          movechart(res.matchup.bTeam.team, gen),
        ],
      };

      let move;
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
      res.status(500).json({ message: (error as Error).message });
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
      res.status(500).json({ message: (error as Error).message });
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
      res.status(500).json({ message: (error as Error).message });
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
      res.status(500).json({ message: (error as Error).message });
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
      res.status(500).json({ message: (error as Error).message });
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
      let gen = Rulesets[res.matchup.ruleset].gen;
      res.json([
        coveragechart(res.matchup.aTeam.team, res.matchup.bTeam.team, gen),
        coveragechart(res.matchup.bTeam.team, res.matchup.aTeam.team, gen),
      ]);
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
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
      let gen = Rulesets[res.matchup.ruleset].gen;
      res.json([
        movechart(res.matchup.aTeam.team, gen),
        movechart(res.matchup.bTeam.team, gen),
      ]);
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
    }
  }
);

matchupRouter.param(
  "matchup_id",
  async (req: Request, res: MatchupResponse, next, matchup_id) => {
    try {
      if (mongoose.Types.ObjectId.isValid(matchup_id)) {
        res.rawMatchup = await MatchupModel.findById(matchup_id);
        let matchup = res.rawMatchup?.toObject();
        if (matchup === null) {
          res.status(400).json({ message: "Matchup ID not found" });
        }
        const aTeam = await DraftModel.findById(matchup.aTeam._id).lean();
        if (aTeam === null) {
          res.status(400).json({ message: "Draft ID not found" });
          next();
          return;
        }
        for (let pokemon of aTeam.team) {
          pokemon.name = getName(pokemon.pid);
        }
        matchup.leagueName = aTeam.leagueName;
        matchup.format = aTeam.format;
        matchup.ruleset = aTeam.ruleset;
        matchup.aTeam = {
          owner: aTeam.owner,
          teamName: aTeam.teamName,
          team: aTeam.team,
          _id: aTeam._id,
        };
        for (let pokemon of matchup.aTeam.team) {
          pokemon.name = getName(pokemon.pid);
        }
        for (let pokemon of matchup.bTeam.team) {
          pokemon.name = getName(pokemon.pid);
        }
        res.matchup = matchup;
      } else {
        return res.status(400).json({ message: "Invalid ID format" });
      }
    } catch (error) {
      return res.status(500).json({ message: (error as Error).message });
    }
    next();
  }
);
