import { FormatId } from "../data/formats";
import { RulesetId, getRuleset } from "../data/rulesets";
import { DraftData, DraftDocument, DraftModel } from "../models/draft.model";
import { PokemonData } from "../models/pokemon.schema";
import { PokemonBuilder, PokemonFormData } from "./pokemon";

export class Draft2 {
  leagueName: string;
  teamName: string;
  leagueId: string;
  format: FormatId;
  ruleset: RulesetId;
  score: { wins: number; loses: number; diff: string };
  owner: string;
  team: PokemonData[];
  doc?: string | undefined;
  constructor(data: {
    leagueName: string;
    teamName: string;
    leagueId: string;
    format: FormatId;
    ruleset: RulesetId;
    score: { wins: number; loses: number; diff: string };
    owner: string;
    team: PokemonData[];
    doc?: string | undefined;
  }) {
    this.leagueName = data.leagueName;
    this.teamName = data.teamName;
    (this.leagueId = data.leagueId), (this.format = data.format);
    this.ruleset = data.ruleset;
    this.score = data.score;
    this.owner = data.owner;
    this.team = data.team;
  }

  static fromForm(
    formData: {
      leagueName: string;
      teamName: string;
      format: string;
      ruleset: string;
      doc?: string;
      team: PokemonFormData[];
    },
    user_id: string
  ): Draft2 {
    const ruleset = getRuleset(formData.ruleset);
    const errors: string[] = [];
    const data = {
      leagueName: formData.leagueName.trim(),
      teamName: formData.teamName.trim(),
      leagueId: formData.leagueName.toLowerCase().trim().replace(/\W/gi, ""),
      format: formData.format.trim() as FormatId,
      ruleset: formData.ruleset.trim() as RulesetId,
      score: {
        wins: 0,
        loses: 0,
        diff: "",
      },
      owner: user_id,
      team: formData.team
        .filter((pokemonData) => pokemonData.id)
        .map((pokemonData) => {
          const pokemon = new PokemonBuilder(ruleset, pokemonData);
          if (pokemon.error) {
            errors.push(pokemon.error);
          }
          return pokemon.data;
        }),
      doc: formData.doc?.trim(),
    };

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    return new Draft2(data);
  }

  toDocument(): DraftDocument {
    const data: DraftData = this;
    return new DraftModel(data);
  }
}
