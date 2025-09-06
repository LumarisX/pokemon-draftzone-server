import { StatsTable, TypeName } from "@pkmn/data";
import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import NodeCache from "node-cache";
import { Route } from ".";
import { Matchup } from "../classes/matchup";
import { DraftSpecie, PokemonFormData } from "../classes/pokemon";
import { Format, FormatId, getFormat } from "../data/formats";
import { getRuleset, Ruleset, RulesetId } from "../data/rulesets";
import { DraftModel } from "../models/draft.model";
import {
  MatchData,
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

export const $matchups = new NodeCache({
  stdTTL: 900,
  checkperiod: 300,
  maxKeys: 50,
});

export const MatchupRoutes: Route = {
  subpaths: {
    "/:matchup_id": {
      get: async (req: Request, res: MatchupResponse) => {
        try {
          const matchup = res.matchup!;
          const cachedData = $matchups.get(
            `${matchup.aTeam._id}-${req.params.matchup_id}`
          );
          if (cachedData) return res.json(cachedData);
          const data = await matchup.analyze();
          $matchups.set(`${matchup.aTeam._id}-${req.params.matchup_id}`, data);
          res.json(data);
        } catch (error) {
          console.log(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R1-01" });
        }
      },
      delete: async (req: Request, res: MatchupResponse) => {
        if (!res.matchupOld || !res.rawMatchup) {
          return;
        }
        try {
          await res.rawMatchup.deleteOne();
          $matchups.del(`${res.matchupOld.aTeam._id}-${req.params.matchup_id}`);
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
        if (!res.matchupOld || !res.rawMatchup) {
          return;
        }
        try {
          let aTeamsummary = new SummaryClass(
            res.matchupOld.aTeam.team,
            res.matchupOld.aTeam.teamName
          );
          let bTeamsummary = new SummaryClass(
            res.matchupOld.bTeam.team,
            res.matchupOld.bTeam.teamName
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
        if (!res.matchupOld || !res.rawMatchup) {
          return;
        }
        try {
          res.json([
            new Typechart(res.matchupOld.aTeam.team).toJson(),
            new Typechart(res.matchupOld.bTeam.team).toJson(),
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
        if (!res.matchupOld) {
          return;
        }
        try {
          let level = getFormat(res.matchupOld.formatId).level;
          res.json(
            speedchart(
              [res.matchupOld.aTeam.team, res.matchupOld.bTeam.team],
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
        if (!res.matchupOld) {
          return;
        }
        try {
          res.json([
            coveragechart(res.matchupOld.aTeam.team, res.matchupOld.bTeam.team),
            coveragechart(res.matchupOld.bTeam.team, res.matchupOld.aTeam.team),
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
        if (!res.matchupOld) {
          return;
        }
        try {
          res.json([
            await movechart(
              res.matchupOld.aTeam.team,
              res.matchupOld.aTeam.team[0].ruleset
            ),
            movechart(
              res.matchupOld.bTeam.team,
              res.matchupOld.bTeam.team[0].ruleset
            ),
          ]);
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
        let data = await matchup.analyze();
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
          res.rawMatchup = await MatchupModel.findById(matchup_id);
          if (!res.rawMatchup) {
            return res
              .status(404)
              .json({ message: "Matchup not found.", code: "MR-P1-01" });
          }
          const matchupData = res.rawMatchup.toObject<MatchupData>();
          res.matchup = await Matchup.fromData(matchupData);
          const aTeam = await DraftModel.findById(matchupData.aTeam._id).lean();
          if (!aTeam) {
            res
              .status(404)
              .json({
                message: "Draft not found for this matchup.",
                code: "MR-P1-02",
              });
            return next();
          }
          res.ruleset = getRuleset(aTeam.ruleset);
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
          if (res.ruleset === undefined) {
            return res
              .status(500)
              .json({
                message: "Invalid ruleset ID for this matchup.",
                code: "MR-P1-03",
              });
          }
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

async function makeMatchup(
  aTeam: TeamData,
  bTeam: TeamData,
  details: {
    ruleset: Ruleset;
    format: Format;
    gameTime?: string;
    stage?: string;
    leagueName?: string;
  }
) {
  let aTypechart = new Typechart(aTeam.team);
  let bTypechart = new Typechart(bTeam.team);
  let data: {
    details: {
      level: number;
      format: FormatId;
      ruleset: RulesetId;
      gameTime?: string;
      stage?: string;
      leagueName?: string;
    };
    summary: {
      teamName?: string;
      team: (PokemonFormData & {
        abilities: string[];
        baseStats: StatsTable;
        types: [TypeName] | [TypeName, TypeName];
      })[];
      stats?: {
        mean: {
          hp?: number;
          atk?: number;
          def?: number;
          spa?: number;
          spd?: number;
          spe?: number;
        };
        median: {
          hp?: number;
          atk?: number;
          def?: number;
          spa?: number;
          spd?: number;
          spe?: number;
        };
        max: {
          hp?: number;
          atk?: number;
          def?: number;
          spa?: number;
          spd?: number;
          spe?: number;
        };
      };
    }[];
    speedchart: Speedchart;
    coveragechart: Coveragechart[];
    typechart: {
      team: (
        | PokemonFormData & {
            weak: { [key: string]: number }[];
          }
      )[];
      teraTypes: {
        [key: string]: {};
      };
    }[];
    movechart: Movechart[];
  } = {
    details: {
      level: details.format.level,
      format: details.format.name,
      ruleset: details.ruleset.name,
      gameTime: details.gameTime,
      leagueName: details.leagueName,
      stage: details.stage,
    },
    summary: [],
    speedchart: speedchart([aTeam.team, bTeam.team], details.format.level),
    coveragechart: [
      await coveragechart(aTeam.team, bTeam.team),
      await coveragechart(bTeam.team, aTeam.team),
    ],
    typechart: [aTypechart.toJson(), bTypechart.toJson()],
    movechart: [
      await movechart(aTeam.team, aTeam.team[0].ruleset),
      await movechart(bTeam.team, bTeam.team[0].ruleset),
    ],
  };
  let aTeamsummary = new SummaryClass(aTeam.team, aTeam.teamName);
  let bTeamsummary = new SummaryClass(bTeam.team, bTeam.teamName);
  data.summary = [aTeamsummary.toJson(), bTeamsummary.toJson()];
  return data;
}
