import { Types } from "mongoose";
import { Ruleset } from "../data/rulesets";
import { MatchupDocument, MatchupModel } from "../models/matchup.model";
import { PokemonData } from "../models/pokemon.schema";
import { PokemonBuilder, PokemonFormData } from "./pokemon";

type MatchupDoc = {
  aTeam: Side;
  bTeam: Side;
  stage: string;
  replay?: string;
};

export type Side = {
  _id?: Types.ObjectId;
  teamName: string;
  team: PokemonData[];
  name?: string;
  paste?: string;
};

export class Matchup {
  constructor(
    private ruleset: Ruleset,
    private formData: {
      teamName: string;
      stage: string;
      team: PokemonFormData[];
    },
    private aTeamId: Types.ObjectId
  ) {}

  async createMatchup(): Promise<MatchupDocument> {
    const data = await this.prepareData();
    const model = new MatchupModel(data);
    return model;
  }

  private async prepareData(): Promise<MatchupDoc> {
    const data: MatchupDoc = {
      aTeam: {
        _id: this.aTeamId,
        teamName: "",
        team: [],
        name: undefined,
        paste: undefined,
      },
      bTeam: {
        teamName: this.formData.teamName.trim(),
        team: [],
        name: undefined,
        paste: undefined,
      },
      stage: this.formData.stage.trim(),
    };
    const errors: string[] = [];
    for (const pokemonData of this.formData.team) {
      if (pokemonData.id !== "") {
        const pokemon = new PokemonBuilder(this.ruleset, pokemonData);
        if (pokemon.error) {
          errors.push(pokemon.error);
        } else {
          data.bTeam.team.push(pokemon.data);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }
    return data;
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
