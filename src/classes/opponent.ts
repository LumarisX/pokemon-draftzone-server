import { Types } from "mongoose";
import { Ruleset } from "../data/rulesets";
import { DraftSpecie, PokemonFormData } from "./pokemon";
import { MatchData } from "../models/matchup.model";

export class Opponent {
  constructor(
    public ruleset: Ruleset,
    public team: DraftSpecie[],
    public teamName: string,
    public matches: MatchData[],
    public stage: string,
    public coach?: string,
    public _id?: Types.ObjectId
  ) {}

  toClient() {
    return {
      stage: this.stage,
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon) => pokemon.toClient()),
      score: getMatchesScore(this.matches),
      _id: this._id,
    };
  }

  static fromForm(
    data: {
      stage: string;
      teamName: string;
      coach: string | undefined;
      team: PokemonFormData[];
      matches: MatchData[];
      _id?: Types.ObjectId;
    },
    ruleset: Ruleset
  ): Opponent {
    const errors: string[] = [];
    const opponent = new Opponent(
      ruleset,
      data.team
        .filter((pokemonData) => pokemonData.id)
        .map((pokemonData) => new DraftSpecie(pokemonData, ruleset)),
      data.teamName,
      data.matches,
      data.stage,
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

export function getMatchesScore(
  matches?: MatchData[]
): [number, number] | null {
  if (!matches?.length) return null;
  if (matches.length === 1)
    return [
      matches[0].aTeam.stats.filter(
        (pokemon) => pokemon[1].brought && !pokemon[1].deaths
      ).length,
      matches[0].bTeam.stats.filter(
        (pokemon) => pokemon[1].brought && !pokemon[1].deaths
      ).length,
    ];

  return matches.reduce(
    (score: [number, number], match) => {
      if (match.winner === "a") score[0]++;
      else score[1]++;
      return score;
    },
    [0, 0]
  );
}
