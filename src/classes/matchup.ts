import { ObjectId } from "mongoose";
import { Ruleset } from "../data/rulesets";
import { MatchupDocument, MatchupModel } from "../models/matchup.model";
import { Pokemon, PokemonBuilder, PokemonFormData } from "./pokemon";

type MatchupDoc = {
  aTeam: Side;
  bTeam: Side;
  stage: string;
  replay?: string;
};

export type Side = {
  _id?: ObjectId;
  teamName: string;
  team: Pokemon[];
  name?: string;
  stats: [
    string,
    {
      indirect?: number;
      kills?: number;
      deaths?: number;
      brought?: number;
    }
  ][];
  score: number;
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
    private aTeamId: ObjectId
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
        stats: [],
        score: 0,
        paste: undefined,
      },
      bTeam: {
        teamName: this.formData.teamName.trim(),
        team: [],
        name: undefined,
        stats: [],
        score: 0,
        paste: undefined,
      },
      stage: this.formData.stage.trim(),
    };
    const errors: string[] = [];
    for (const pokemonData of this.formData.team) {
      const pokemon = new PokemonBuilder(this.ruleset, pokemonData);
      if (pokemon.error) {
        errors.push(pokemon.error);
      } else {
        data.bTeam.team.push(pokemon.data);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }
    return data;
  }
}

export class Score {
  constructor(private scoreData: any) {}

  async processScore(): Promise<any> {
    const data: any = {};
    data.aTeam = { stats: [], paste: "", score: 0 };
    data.bTeam = { stats: [], paste: "", score: 0 };
    const pastePattern = /^(https:\/\/)?pokepast\.es\/[a-zA-Z0-9]{16}$/;
    if (
      this.scoreData.aTeam.paste != null &&
      this.scoreData.aTeam.paste != ""
    ) {
      data.aTeam.paste = this.scoreData.aTeam.paste;
    }
    if (
      this.scoreData.bTeam.paste != null &&
      this.scoreData.bTeam.paste != ""
    ) {
      data.bTeam.paste = this.scoreData.bTeam.paste;
    }
    if (this.scoreData.replay != null && this.scoreData.replay != "") {
      data.replay = this.scoreData.replay;
    }
    data.aTeam.score = this.scoreData.aTeam.score;
    data.bTeam.score = this.scoreData.bTeam.score;

    let aTeamStats: { [key: string]: any } = {};
    for (const stat of this.scoreData.aTeam.team) {
      const pokemonStats: any = {};
      if (stat.kills != null && stat.kills > 0) {
        pokemonStats.kills = stat.kills;
      }
      if (stat.deaths != null && stat.deaths > 0) {
        pokemonStats.deaths = stat.deaths;
      }
      if (stat.indirect != null && stat.indirect > 0) {
        pokemonStats.indirect = stat.indirect;
      }
      if (stat.brought != null && stat.brought > 0) {
        pokemonStats.brought = stat.brought;
      }
      if (Object.keys(pokemonStats).length > 0) {
        aTeamStats[stat.pokemon.pid] = pokemonStats;
      }
    }
    data.aTeam.stats = Object.entries(aTeamStats);
    let bTeamStats: { [key: string]: any } = {};
    for (const stat of this.scoreData.bTeam.team) {
      const pokemonStats: any = {};
      if (stat.kills != null && stat.kills > 0) {
        pokemonStats.kills = stat.kills;
      }
      if (stat.deaths != null && stat.deaths > 0) {
        pokemonStats.deaths = stat.deaths;
      }
      if (stat.indirect != null && stat.indirect > 0) {
        pokemonStats.indirect = stat.indirect;
      }
      if (stat.brought != null && stat.brought > 0) {
        pokemonStats.brought = stat.brought;
      }
      if (Object.keys(pokemonStats).length > 0) {
        bTeamStats[stat.pokemon.pid] = pokemonStats;
      }
    }
    data.bTeam.stats = Object.entries(bTeamStats);
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
