import { AbilityName, StatsTable, TypeName } from "@pkmn/data";
import { Types } from "mongoose";
import { PZError } from "..";
import { Format, FormatId } from "../data/formats";
import { Ruleset, RulesetId } from "../data/rulesets";
import { DraftDocument, DraftModel } from "../models/draft.model";
import { MatchData, MatchupData } from "../models/matchup.model";
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
import { Draft } from "./draft";
import { Opponent } from "./opponent";
import { DraftSpecie, PokemonFormData } from "./pokemon";

export type MatchupTeam = {
  teamName: string;
  team: DraftSpecie[];
  coach?: string;
  paste?: string;
  _id?: Types.ObjectId;
};

export class Matchup {
  constructor(
    public aTeam: MatchupTeam,
    public bTeam: MatchupTeam,
    public ruleset: Ruleset,
    public format: Format,
    public leagueName: string,
    public leagueId: string,
    public stage: string,
    public matches: MatchData[],
    public notes?: string,
    public gameTime?: string,
    public reminder?: number
  ) {}

  static async fromData(
    data: MatchupData & { _id: Types.ObjectId },
    draft?: Draft
  ): Promise<Matchup> {
    if (!draft) {
      const draftDoc: DraftDocument | null = await DraftModel.findById(
        data.aTeam._id
      );
      if (!draftDoc) throw new PZError(400, "Draft ID not found.");
      draft = Draft.fromData(draftDoc);
    }
    return new Matchup(
      {
        teamName: draft.teamName,
        _id: data.aTeam._id,
        paste: data.aTeam.paste,
        team: draft.team,
        // coach:
      },
      {
        teamName: data.bTeam.teamName,
        coach: data.bTeam.coach,
        team: data.bTeam.team.map(
          (pokemon) => new DraftSpecie(pokemon, draft.ruleset)
        ),
        _id: data._id,
        paste: data.bTeam.paste,
      },
      draft.ruleset,
      draft.format,
      draft.leagueName,
      draft.leagueId,
      data.stage,
      data.matches,
      data.notes,
      data.gameTime,
      data.reminder
    );
  }

  toData(): MatchupData {
    return {
      aTeam: {
        _id: this.aTeam._id!,
        paste: this.aTeam.paste,
      },
      bTeam: {
        teamName: this.bTeam.teamName,
        coach: this.bTeam.coach ?? undefined,
        paste: this.bTeam.paste,
        team: this.bTeam.team.map((pokemon) => pokemon.toData()),
      },
      stage: this.stage,
      matches: this.matches,
      notes: this.notes,
      gameTime: this.gameTime,
      reminder: this.reminder,
    };
  }

  toClient() {
    return {
      _id: this.bTeam._id,
      leagueName: this.leagueName,
      aTeam: {
        team: this.aTeam.team.map((pokemon) => pokemon.toClient()),
        teamName: this.aTeam.teamName,
        paste: this.aTeam.paste,
        coach: this.aTeam.coach,
      },
      bTeam: {
        team: this.bTeam.team.map((pokemon) => pokemon.toClient()),
        teamName: this.bTeam.teamName,
        paste: this.bTeam.paste,
        coach: this.bTeam.coach,
      },
      stage: this.stage,
      matches: this.matches,
      score: [1, 3],
    };
  }

  async analyze() {
    const data: {
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
        level: this.format.level,
        format: this.format.name,
        ruleset: this.ruleset.name,
        gameTime: this.gameTime,
        leagueName: this.leagueName,
        stage: this.stage,
      },
      summary: [
        new SummaryClass(this.aTeam.team, this.aTeam.teamName).toJson(),
        new SummaryClass(this.bTeam.team, this.bTeam.teamName).toJson(),
      ],
      speedchart: speedchart(
        [this.aTeam.team, this.bTeam.team],
        this.format.level
      ),
      coveragechart: [
        await coveragechart(this.aTeam.team, this.bTeam.team),
        await coveragechart(this.bTeam.team, this.aTeam.team),
      ],
      typechart: [
        new Typechart(this.aTeam.team).toJson(),
        new Typechart(this.bTeam.team).toJson(),
      ],
      movechart: [
        await movechart(this.aTeam.team, this.aTeam.team[0].ruleset),
        await movechart(this.bTeam.team, this.bTeam.team[0].ruleset),
      ],
    };
    return data;
  }

  static fromForm(draft: Draft, opponent: Opponent) {
    return new Matchup(
      {
        team: draft.team,
        teamName: draft.teamName,
        _id: draft._id!,
        // coach:
      },
      {
        team: opponent.team,
        teamName: opponent.teamName,
      },
      draft.ruleset,
      draft.format,
      draft.leagueName,
      draft.leagueId,
      opponent.stage,
      []
    );
  }

  toOpponent(): Opponent {
    return new Opponent(
      this.ruleset,
      this.stage,
      this.bTeam.team,
      this.bTeam.teamName,
      this.matches,
      this.bTeam.coach,
      this.bTeam._id
    );
  }
}

export class Score {
  constructor(
    private scoreData: {
      bTeamPaste: string;
      aTeamPaste: string;
      matches: {
        replay: string;
        winner: "a" | "b" | "";
        aTeam: {
          team: {
            pokemon: { id: string };
            kills: number;
            fainted: number;
            indirect: number;
            brought: number;
          }[];
        };
        bTeam: {
          team: {
            pokemon: { id: string };
            kills: number;
            fainted: number;
            indirect: number;
            brought: number;
          }[];
        };
      }[];
    }
  ) {}

  async processScore(): Promise<{
    matches: {}[];
    aTeamPaste?: string | undefined;
    bTeamPaste?: string | undefined;
  }> {
    const data: {
      matches: {}[];
      aTeamPaste?: string;
      bTeamPaste?: string;
    } = {
      matches: [],
    };
    const pastePattern = /^(https:\/\/)?pokepast\.es\/[a-zA-Z0-9]{16}$/;

    if (this.scoreData.aTeamPaste != "") {
      data.aTeamPaste = this.scoreData.aTeamPaste;
    }
    if (this.scoreData.bTeamPaste != "") {
      data.bTeamPaste = this.scoreData.bTeamPaste;
    }
    this.scoreData.matches.forEach((match) => {
      let matchData: {
        replay?: string;
        winner: "" | "a" | "b";
        aTeam: { stats: [string, any][]; score: number };
        bTeam: { stats: [string, any][]; score: number };
      } = {
        aTeam: { stats: [], score: 0 },
        bTeam: { stats: [], score: 0 },
        winner: "",
      };
      if (match.replay != "") {
        matchData.replay = match.replay;
      }
      if (match.winner) {
        matchData.winner = match.winner;
      }
      let aTeamStats: { [key: string]: any } = {};
      for (const stat of match.aTeam.team) {
        if (stat.brought) {
          const pokemonStats: {
            kills?: number;
            indirect?: number;
            deaths?: number;
            brought?: number;
          } = {};
          if (stat.kills > 0) {
            pokemonStats.kills = stat.kills;
          }
          if (stat.fainted > 0) {
            pokemonStats.deaths = stat.fainted;
          }
          if (stat.indirect > 0) {
            pokemonStats.indirect = stat.indirect;
          }
          if (stat.brought > 0) {
            pokemonStats.brought = stat.brought;
          }
          if (Object.keys(pokemonStats).length > 0) {
            aTeamStats[stat.pokemon.id] = pokemonStats;
          }
        }
      }
      matchData.aTeam.stats = Object.entries(aTeamStats);
      let bTeamStats: { [key: string]: any } = {};
      for (const stat of match.bTeam.team) {
        if (stat.brought) {
          const pokemonStats: {
            kills?: number;
            indirect?: number;
            deaths?: number;
            brought?: number;
          } = {};
          if (stat.kills > 0) {
            pokemonStats.kills = stat.kills;
          }
          if (stat.fainted > 0) {
            pokemonStats.deaths = stat.fainted;
          }
          if (stat.indirect > 0) {
            pokemonStats.indirect = stat.indirect;
          }
          if (stat.brought > 0) {
            pokemonStats.brought = stat.brought;
          }
          if (Object.keys(pokemonStats).length > 0) {
            bTeamStats[stat.pokemon.id] = pokemonStats;
          }
        }
      }
      matchData.bTeam.stats = Object.entries(bTeamStats);
      matchData.aTeam.score =
        matchData.aTeam.stats.length -
        matchData.aTeam.stats.reduce(
          (deaths, mon) => (deaths += +(mon[1].deaths > 0)),
          0
        );
      matchData.bTeam.score =
        matchData.bTeam.stats.length -
        matchData.bTeam.stats.reduce(
          (deaths, mon) => (deaths += +(mon[1].deaths > 0)),
          0
        );
      data.matches.push(matchData);
    });
    return data;
  }
}

export class GameTime {
  constructor(
    private timeData: { dateTime: string; email: boolean; emailTime: number }
  ) {}

  async processTime(): Promise<{ dateTime: string; emailTime: number }> {
    return {
      dateTime: this.timeData.dateTime,
      emailTime: this.timeData.email
        ? Math.floor(this.timeData.emailTime * 60)
        : -1,
    };
  }
}
