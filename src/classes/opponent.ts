import { match } from "assert";
import { MatchData, MatchupData } from "../models/matchup.model";
import { MatchupTeam } from "./matchup";
import { DraftSpecies, PokemonBuilder, PokemonFormData } from "./pokemon";
import { getRuleset, Ruleset } from "../data/rulesets";

type OpponentClientData = {
  matches: MatchData[];
  stage: string;
  teamName: string;
  coach: string | undefined;
  team: PokemonFormData[];
};

export class Opponent {
  constructor(
    public ruleset: Ruleset,
    public stage: string,
    public matches: MatchData[],
    public team: DraftSpecies[],
    public teamName: string,
    public coach?: string
  ) {}

  toClient(): OpponentClientData {
    return {
      matches: this.matches,
      stage: this.stage,
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon) => pokemon.toClient()),
    };
  }

  static fromMatchup(matchup: MatchupData, team: MatchupTeam): Opponent {
    return new Opponent(
      team.ruleset,
      matchup.stage,
      matchup.matches,
      team.team,
      team.teamName,
      team.coach
    );
  }

  static fromForm(data: OpponentClientData, ruleset: Ruleset): Opponent {
    const errors: string[] = [];
    const opponent = new Opponent(
      ruleset,
      data.stage,
      data.matches,
      data.team
        .filter((pokemonData) => pokemonData.id)
        .map((pokemonData) => {
          const pokemon = new PokemonBuilder(ruleset, pokemonData);
          if (pokemon.error) {
            errors.push(pokemon.error);
          }
          return new DraftSpecies(pokemon.data, ruleset);
        }),
      data.teamName,
      data.coach
    );
    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }
    return opponent;
  }
}
