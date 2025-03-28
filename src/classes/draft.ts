import { Types } from "mongoose";
import { Format, getFormat } from "../data/formats";
import { Ruleset, getRuleset } from "../data/rulesets";
import { DraftData } from "../models/draft.model";
import { DraftSpecie, PokemonFormData } from "./pokemon";

export class Draft2 {
  constructor(
    public ruleset: Ruleset,
    public format: Format,
    public leagueName: string,
    public teamName: string,
    public leagueId: string,
    public score: { wins: number; loses: number; diff: string },
    public owner: string,
    public team: DraftSpecie[],
    public doc?: string | undefined,
    public _id?: Types.ObjectId
  ) {}

  static fromForm(
    formData: {
      leagueName: string;
      teamName: string;
      format: string;
      ruleset: string;
      doc?: string;
      team: PokemonFormData[];
    },
    user_id: string,
    ruleset?: Ruleset,
    format?: Format
  ): Draft2 {
    if (!ruleset) ruleset = getRuleset(formData.ruleset);
    if (!format) format = getFormat(formData.format);
    return new Draft2(
      ruleset,
      format,
      formData.leagueName.trim(),
      formData.teamName.trim(),
      formData.leagueName.toLowerCase().trim().replace(/\W/gi, ""),
      {
        wins: 0,
        loses: 0,
        diff: "",
      },
      user_id,
      formData.team
        .filter((pokemonData) => pokemonData.id)
        .map((pokemonData) => new DraftSpecie(pokemonData, ruleset)),
      formData.doc?.trim()
    );
  }

  toData(): DraftData {
    return {
      leagueName: this.leagueName,
      leagueId: this.leagueId,
      teamName: this.teamName,
      format: this.format.name,
      ruleset: this.ruleset.name,
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
      ruleset: this.ruleset.name,
      score: this.score,
      doc: this.doc,
      team: this.team.map((pokemon) => pokemon.toClient()),
    };
  }

  static fromData(
    data: DraftData & { _id: Types.ObjectId },
    ruleset?: Ruleset,
    format?: Format
  ): Draft2 {
    if (!ruleset) ruleset = getRuleset(data.ruleset);
    if (!format) format = getFormat(data.format);
    const types = Array.from(ruleset.types).map((type) => type.name);
    return new Draft2(
      ruleset,
      format,
      data.leagueName,
      data.teamName,
      data.leagueId,
      data.score,
      data.owner,
      data.team.map((pokemon) => {
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
        return new DraftSpecie(pokemon, ruleset);
      }),
      data.doc,
      data._id
    );
  }
}
