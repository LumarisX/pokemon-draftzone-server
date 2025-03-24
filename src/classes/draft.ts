import { FormatId } from "../data/formats";
import { RulesetId, getRuleset } from "../data/rulesets";
import { DraftData } from "../models/draft.model";
import { DraftSpecies, PokemonBuilder, PokemonFormData } from "./pokemon";

export class Draft2 {
  leagueName: string;
  teamName: string;
  leagueId: string;
  format: FormatId;
  ruleset: RulesetId;
  score: { wins: number; loses: number; diff: string };
  owner: string;
  team: DraftSpecies[];
  doc?: string | undefined;
  constructor(data: {
    leagueName: string;
    teamName: string;
    leagueId: string;
    format: FormatId;
    ruleset: RulesetId;
    score: { wins: number; loses: number; diff: string };
    owner: string;
    team: DraftSpecies[];
    doc?: string | undefined;
  }) {
    this.leagueName = data.leagueName;
    this.teamName = data.teamName;
    (this.leagueId = data.leagueId), (this.format = data.format);
    this.ruleset = data.ruleset;
    this.score = data.score;
    this.owner = data.owner;
    this.team = data.team;
    this.doc = data.doc;
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
          return new DraftSpecies(pokemon.data, ruleset);
        }),
      doc: formData.doc?.trim(),
    };

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    return new Draft2(data);
  }

  toData(): DraftData {
    return {
      leagueName: this.leagueName,
      leagueId: this.leagueId,
      teamName: this.teamName,
      format: this.format,
      ruleset: this.ruleset,
      score: this.score,
      owner: this.owner,
      doc: this.doc,
      team: this.team.map((pokemon) => pokemon.toData()),
    };
  }

  toClient() {
    return {
      leagueName: this.leagueName,
      leagueId: this.leagueId,
      teamName: this.teamName,
      format: this.format,
      ruleset: this.ruleset,
      score: this.score,
      doc: this.doc,
      team: this.team.map((pokemon) => pokemon.toClient()),
    };
  }

  static fromDocument(data: DraftData): Draft2 {
    const ruleset = getRuleset(data.ruleset);
    const types = Array.from(ruleset.types).map((type) => type.name);
    return new Draft2({
      leagueName: data.leagueName,
      leagueId: data.leagueId,
      teamName: data.teamName,
      format: data.format,
      ruleset: data.ruleset,
      score: data.score,
      owner: data.owner,
      doc: data.doc,
      team: data.team.map((pokemon) => {
        if (pokemon.capt) {
          pokemon.capt.tera = pokemon.capt?.tera
            ? pokemon.capt.tera.length
              ? pokemon.capt.tera
              : types
            : undefined;
          pokemon.capt.z = pokemon.capt?.z
            ? pokemon.capt.z.length
              ? pokemon.capt.z
              : types.filter((type) => type !== "Stellar")
            : undefined;
        }
        return new DraftSpecies(pokemon, ruleset);
      }),
    });
  }
}
