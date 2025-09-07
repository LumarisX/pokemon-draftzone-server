import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { Route } from ".";
import { Matchup } from "../classes/matchup";
import { DraftSpecie } from "../classes/pokemon";
import { FormatId, getFormat } from "../data/formats";
import { getRuleset, Ruleset, RulesetId } from "../data/rulesets";
import {
  MatchData,
  MatchupData,
  MatchupDocument,
} from "../models/matchup.model";
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

type MatchupOld = {
  formatId: FormatId;
  rulesetId: RulesetId;
  leagueName: string;
  aTeam: TeamData;
  bTeam: TeamData;
  gameTime?: string;
  reminder?: number;
  stage: string;
  createdAt?: Date;
  updatedAt?: Date;
  matches: MatchData[];
};

type MatchupResponse = Response & {
  rawMatchup?: MatchupDocument | null;
  matchupOld?: MatchupOld & { aTeam: { owner: string } };
  matchup?: Matchup;
  ruleset?: Ruleset;
};

type TeamData = {
  team: DraftSpecie[];
  name?: string;
  teamName?: string;
  paste?: string;
  _id?: Types.ObjectId;
};

export const MatchupRoutes: Route = {
  subpaths: {
    "/:matchup_id": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const matchup = res.matchup!;
          const data = await matchup.analyze();
          res.json(data);
        } catch (error) {
          console.log(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R1-01" });
        }
      },
      delete: async (req: Request, res: MatchupResponse) => {
        try {
          await deleteMatchup(req.params.matchup_id);
          res.json({ message: "Matchup deleted" });
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R1-02" });
        }
      },
    },
    "/:matchup_id/summary": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const aTeamsummary = new SummaryClass(
            res.matchupOld!.aTeam.team,
            res.matchupOld!.aTeam.teamName
          );
          const bTeamsummary = new SummaryClass(
            res.matchupOld!.bTeam.team,
            res.matchupOld!.bTeam.teamName
          );
          res.json([aTeamsummary.toJson(), bTeamsummary.toJson()]);
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R2-02" });
        }
      },
    },
    "/:matchup_id/typechart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          res.json([
            new Typechart(res.matchupOld!.aTeam.team).toJson(),
            new Typechart(res.matchupOld!.bTeam.team).toJson(),
          ]);
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R3-01" });
        }
      },
    },
    "/:matchup_id/speedchart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const level = getFormat(res.matchupOld!.formatId).level;
          res.json(
            speedchart(
              [res.matchupOld!.aTeam.team, res.matchupOld!.bTeam.team],
              level
            )
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R4-01" });
        }
      },
    },
    "/:matchup_id/coveragechart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          res.json([
            coveragechart(
              res.matchupOld!.aTeam.team,
              res.matchupOld!.bTeam.team
            ),
            coveragechart(
              res.matchupOld!.bTeam.team,
              res.matchupOld!.aTeam.team
            ),
          ]);
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R5-01" });
        }
      },
    },
    "/:matchup_id/movechart": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          res.json(
            await Promise.all([
              movechart(
                res.matchupOld!.aTeam.team,
                res.matchupOld!.aTeam.team[0].ruleset
              ),
              movechart(
                res.matchupOld!.bTeam.team,
                res.matchupOld!.bTeam.team[0].ruleset
              ),
            ])
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R6-01" });
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
            return res
              .status(404)
              .json({ message: "Matchup not found.", code: "MR-P1-01" });
          }
          const matchupData = res.rawMatchup.toObject<MatchupData>();
          res.matchup = await Matchup.fromData(matchupData);
          const aTeam = await getDraft(matchupData.aTeam._id);
          if (!aTeam) {
            return res.status(404).json({
              message: "Draft not found for this matchup.",
              code: "MR-P1-02",
            });
          }
          res.ruleset = getRuleset(aTeam.ruleset);
          if (!res.ruleset) {
            return res.status(500).json({
              message: "Invalid ruleset ID for this matchup.",
              code: "MR-P1-03",
            });
          }
          res.matchupOld = {
            ...matchupData,
            aTeam: {
              owner: aTeam.owner,
              teamName: aTeam.teamName,
              team: aTeam.team.map(
                (pokemon) => new DraftSpecie(pokemon, res.ruleset!)
              ),
              _id: aTeam._id,
            },
            bTeam: {
              ...matchupData.bTeam,
              team: matchupData.bTeam.team.map(
                (pokemon) => new DraftSpecie(pokemon, res.ruleset!)
              ),
            },
            leagueName: aTeam.leagueName,
            formatId: aTeam.format as FormatId,
            rulesetId: aTeam.ruleset as RulesetId,
          };
        } else {
          return res
            .status(400) // Bad Request
            .json({ message: "Invalid matchup ID format.", code: "MR-P1-04" });
        }
      } catch (error) {
        res
          .status(500)
          .json({ message: (error as Error).message, code: "MR-P1-05" });
        return console.log(error);
      }
      next();
    },
  },
};
