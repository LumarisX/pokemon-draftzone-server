import { AbilityName, StatsTable, TypeName } from "@pkmn/data";
import { Request, Response } from "express";
import mongoose from "mongoose";
import NodeCache from "node-cache";
import { Route } from ".";
import { DraftSpecies } from "../classes/pokemon";
import { Format, FormatId, getFormat } from "../data/formats";
import { getRuleset, Ruleset, RulesetId } from "../data/rulesets";
import { DraftModel } from "../models/draft.model";
import {
  MatchData,
  MatchupData,
  MatchupDocument,
  MatchupModel,
} from "../models/matchup.model";
import { PokemonData } from "../models/pokemon.schema";
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

type Matchup = {
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
  matchup?: Matchup & { aTeam: { owner: string } };
  ruleset?: Ruleset;
};

type TeamData = {
  team: DraftSpecies[];
  name?: string;
  teamName?: string;
  paste?: string;
  _id?: mongoose.Schema.Types.ObjectId;
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
        if (!res.matchup) {
          return;
        }

        const cachedData = $matchups.get(
          `${res.matchup.aTeam._id}-${req.params.matchup_id}`
        );
        if (cachedData) {
          return res.json(cachedData);
        }
        try {
          let format = getFormat(res.matchup.formatId);
          let data = await makeMatchup(res.matchup.aTeam, res.matchup.bTeam, {
            ruleset: res.ruleset!,
            format: format,
            gameTime: res.matchup.gameTime,
            stage: res.matchup.stage,
            leagueName: res.matchup.leagueName,
          });
          $matchups.set(
            `${res.matchup.aTeam._id}-${req.params.matchup_id}`,
            data
          );
          res.json(data);
        } catch (error) {
          console.log(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "MR-R1-01" });
        }
      },
      delete: async (req: Request, res: MatchupResponse) => {
        if (!res.matchup || !res.rawMatchup) {
          return;
        }
        try {
          await res.rawMatchup.deleteOne();
          $matchups.del(`${res.matchup.aTeam._id}-${req.params.matchup_id}`);
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
        if (!res.matchup || !res.rawMatchup) {
          return;
        }
        try {
          let aTeamsummary = new SummaryClass(
            res.matchup.aTeam.team,
            res.matchup.aTeam.teamName
          );
          let bTeamsummary = new SummaryClass(
            res.matchup.bTeam.team,
            res.matchup.bTeam.teamName
          );
          aTeamsummary.statistics();
          bTeamsummary.statistics();
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
        if (!res.matchup || !res.rawMatchup) {
          return;
        }
        try {
          res.json([
            new Typechart(res.matchup.aTeam.team).toJson(),
            new Typechart(res.matchup.bTeam.team).toJson(),
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
        if (!res.matchup) {
          return;
        }
        try {
          let level = getFormat(res.matchup.formatId).level;
          res.json(
            speedchart([res.matchup.aTeam.team, res.matchup.bTeam.team], level)
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
      },
    },
    "/:matchup_id/movechart": {
      get: async (req: Request, res: MatchupResponse) => {
        if (!res.matchup) {
          return;
        }
        try {
          res.json([
            await movechart(
              res.matchup.aTeam.team,
              res.matchup.aTeam.team[0].ruleset
            ),
            movechart(
              res.matchup.bTeam.team,
              res.matchup.bTeam.team[0].ruleset
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
        let ruleset = getRuleset(req.body.ruleset);
        let format = getFormat(req.body.format);
        let aTeam = req.body.team1.map((pokemon: PokemonData) => {
          let specie = ruleset.gen.dex.species.get(pokemon.id);
          if (!specie) throw new Error(`${pokemon.id} is an unknown id.`);
          let draftSpecies: DraftSpecies = new DraftSpecies(
            specie,
            pokemon,
            ruleset
          );
          return draftSpecies;
        });
        let bTeam = req.body.team2.map((pokemon: PokemonData) => {
          let specie = ruleset.gen.dex.species.get(pokemon.id);
          if (!specie) throw new Error(`${pokemon.id} is an unknown id.`);
          let draftSpecies: DraftSpecies = new DraftSpecies(
            specie,
            pokemon,
            ruleset
          );
          return draftSpecies;
        });
        let data = await makeMatchup(
          { team: aTeam, teamName: "Team 1" },
          { team: bTeam, teamName: "Team 2" },
          {
            ruleset,
            format,
          }
        );
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
          res.ruleset = getRuleset(aTeam.ruleset);
          res.matchup = {
            ...matchup,
            aTeam: {
              owner: aTeam.owner,
              teamName: aTeam.teamName,
              team: aTeam.team.map((pokemon: any) => {
                let specie = res.ruleset!.gen.dex.species.get(pokemon.id);
                if (!specie) throw new Error(`Invalid id: ${pokemon.id}`);
                let draftSpecies: DraftSpecies = new DraftSpecies(
                  specie,
                  pokemon,
                  res.ruleset!
                );
                return draftSpecies;
              }),
              _id: aTeam._id,
            },
            bTeam: {
              ...matchup.bTeam,
              team: matchup.bTeam.team.map((pokemon: any) => {
                let specie = res.ruleset!.gen.dex.species.get(pokemon.id);
                if (!specie) throw new Error(`Invalid id: ${pokemon.id}`);
                let draftSpecies: DraftSpecies = new DraftSpecies(
                  specie,
                  pokemon,
                  res.ruleset!
                );
                return draftSpecies;
              }),
            },
            leagueName: aTeam.leagueName,
            formatId: aTeam.format as FormatId,
            rulesetId: aTeam.ruleset,
          };
          if (res.ruleset === undefined) {
            return res
              .status(400)
              .json({ message: "Invalid ruleset ID", code: "MR-P1-03" });
          }
        } else {
          return res
            .status(400)
            .json({ message: "Invalid ID format", code: "MR-P1-04" });
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
      team: (PokemonData & {
        abilities: AbilityName[];
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
        | PokemonData & {
            weak: { [key: string]: number };
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
  aTeamsummary.statistics();
  bTeamsummary.statistics();
  data.summary = [aTeamsummary.toJson(), bTeamsummary.toJson()];
  return data;
}
