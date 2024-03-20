import mongoose, { ObjectId } from "mongoose";
import { PokemonId } from "../public/data/pokedex";
import { Pokemon, PokemonBuilder } from "./pokemon";
import { MatchupModel } from "../models/matchup.model";

interface MatchupDoc {
  aTeam: Side;
  bTeam: Side;
  stage: string;
  replay?: string;
}

export interface Side {
  _id?: ObjectId;
  teamName: string;
  team: Pokemon[];
  name?: string;
  stats: {
    [key in PokemonId]: {
      kills?: number;
      deaths?: number;
      indirect?: number;
      brought: number;
    };
  };
  score: number;
  paste?: string;
}

export class Matchup {
  constructor(
    private formData: { teamName: string; stage: string; team: Pokemon[] },
    private aTeamId: string
  ) {}

  async createMatchup(): Promise<mongoose.Document> {
    const data = await this.prepareData();
    const model = new MatchupModel(data);
    return model;
  }

  private async prepareData(): Promise<MatchupDoc> {
    const data: MatchupDoc = {
      aTeam: {
        _id: new mongoose.Schema.Types.ObjectId(this.aTeamId),
        teamName: "",
        team: [],
        name: undefined,
        stats: {},
        score: 0,
        paste: undefined,
      },
      bTeam: {
        teamName: this.formData.teamName,
        team: [],
        name: undefined,
        stats: {},
        score: 0,
        paste: undefined,
      },
      stage: this.formData.stage,
    };

    const errors: string[] = [];
    for (const pokemonData of this.formData.team) {
      const pokemon = new PokemonBuilder(pokemonData);
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
    const data = await this.prepareData();
    return data;
  }

  private async prepareData(): Promise<any> {
    const data: any = {};
    data.aTeam = { stats: {} };
    data.bTeam = { stats: {} };

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
        data.aTeam.stats[stat.pokemon.pid] = pokemonStats;
      }
    }

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
        data.bTeam.stats[stat.pokemon.pid] = pokemonStats;
      }
    }

    return data;
  }
}
