import { Types } from "mongoose";
import { Ruleset } from "../data/rulesets";
import { DraftSpecie, PokemonFormData } from "./pokemon";

type OpponentClientData = {
  stage: string;
  teamName: string;
  coach: string | undefined;
  team: PokemonFormData[];
  _id?: Types.ObjectId;
};

export class Opponent {
  constructor(
    public ruleset: Ruleset,
    public stage: string,
    public team: DraftSpecie[],
    public teamName: string,
    public coach?: string,
    public _id?: Types.ObjectId
  ) {}

  toClient(): OpponentClientData {
    return {
      stage: this.stage,
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon) => pokemon.toClient()),
      _id: this._id,
    };
  }

  static fromForm(data: OpponentClientData, ruleset: Ruleset): Opponent {
    const errors: string[] = [];
    const opponent = new Opponent(
      ruleset,
      data.stage,
      data.team
        .filter((pokemonData) => pokemonData.id)
        .map((pokemonData) => new DraftSpecie(pokemonData, ruleset)),
      data.teamName,
      data.coach
    );
    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }
    return opponent;
  }

  toData() {
    return {
      bTeam: {
        teamName: this.teamName,
        coach: this.coach ?? undefined,
        team: this.team.map((pokemon) => pokemon.toData()),
      },
      stage: this.stage,
    };
  }
}
