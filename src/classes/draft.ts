import { ObjectId } from "mongoose";
import { FormatId } from "../data/formats";
import { RulesetId } from "../data/rulesets";
import { DraftDocument, DraftModel } from "../models/draft.model";
import { Pokemon, PokemonBuilder } from "./pokemon";
import { Generation, ID } from "@pkmn/data";

interface DraftDoc {
  leagueName: string;
  teamName: string;
  leagueId: string;
  format: FormatId;
  ruleset: RulesetId;
  score: {
    wins: number;
    loses: number;
    diff: string;
  };
  owner: ObjectId;
  team: Pokemon[];
}

export class Draft {
  constructor(
    private gen: Generation,
    private formData: {
      leagueName: string;
      format: FormatId;
      teamName: string;
      ruleset: RulesetId;
      team: Pokemon[];
    },
    private user_id: ObjectId
  ) {}

  async createDraft(): Promise<DraftDocument> {
    const data = await this.prepareData();
    const draftModel = new DraftModel(data);
    return draftModel;
  }

  private async prepareData(): Promise<DraftDoc> {
    const data: DraftDoc = {
      leagueName: this.formData.leagueName,
      teamName: this.formData.teamName,
      leagueId: this.formData.leagueName.toLowerCase().replace(/\W/gi, ""),
      format: this.formData.format,
      ruleset: this.formData.ruleset,
      score: {
        wins: 0,
        loses: 0,
        diff: "",
      },
      owner: this.user_id,
      team: [],
    };

    const errors: string[] = [];
    for (const pokemonData of this.formData.team) {
      const pokemon = new PokemonBuilder(this.gen, pokemonData);
      if (pokemon.error) {
        errors.push(pokemon.error);
      } else {
        data.team.push(pokemon.data);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    return data;
  }
}
