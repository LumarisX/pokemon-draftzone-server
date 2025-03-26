import { Ruleset } from "../data/rulesets";
import { Matchup, MatchupTeam } from "./matchup";
import { DraftSpecie, PokemonFormData } from "./pokemon";

type OpponentClientData = {
  stage: string;
  teamName: string;
  coach: string | undefined;
  team: PokemonFormData[];
};

export class Opponent {
  constructor(
    public ruleset: Ruleset,
    public stage: string,
    public team: DraftSpecie[],
    public teamName: string,
    public coach?: string
  ) {}

  toClient(): OpponentClientData {
    return {
      stage: this.stage,
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon) => pokemon.toClient()),
    };
  }

  toMatchup(): MatchupTeam {
    return new MatchupTeam(
      this.ruleset,
      this.teamName,
      this.team,
      undefined,
      this.coach
    );
  }

  static fromMatchup(matchup: Matchup, team: MatchupTeam): Opponent {
    return new Opponent(
      team.ruleset,
      matchup.stage,
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
