import { ObjectId } from "mongoose";
import { FormatId } from "../data/formats";
import { Ruleset, RulesetId, Rulesets } from "../data/rulesets";
import { DraftDocument, DraftModel } from "../models/draft.model";
import { Pokemon, PokemonBuilder, PokemonFormData } from "./pokemon";

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
    private formData: {
      leagueName: string;
      format: string;
      teamName: string;
      ruleset: string;
      team: PokemonFormData[];
    },
    private user_id: ObjectId
  ) {}

  async createDraft(): Promise<DraftDocument> {
    const data = await this.prepareData();
    const draftModel = new DraftModel(data);
    return draftModel;
  }

  private async prepareData(): Promise<DraftDoc> {
    const ruleset = Rulesets[this.formData.ruleset];
    const data: DraftDoc = {
      leagueName: this.formData.leagueName.trim(),
      teamName: this.formData.teamName.trim(),
      leagueId: this.formData.leagueName
        .toLowerCase()
        .trim()
        .replace(/\W/gi, ""),
      format: this.formData.format.trim() as FormatId,
      ruleset: this.formData.ruleset.trim() as RulesetId,
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
      if (pokemonData.pid != "") {
        const pokemon = new PokemonBuilder(ruleset, pokemonData);
        if (pokemon.error) {
          errors.push(pokemon.error);
        } else {
          data.team.push(pokemon.data);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    return data;
  }
}
