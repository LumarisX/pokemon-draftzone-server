import { DraftSpecie } from "@modules/pokemon/pokemon.domain";
import { typeWeak } from "../../../services/data-services/type.services";

export function generateTeamTypechart(team: DraftSpecie[]) {
  const teraTypes: {
    [key: string]: {};
  } = {};
  return {
    team: team.map((pokemon) => ({
      ...pokemon.toClient(),
      weak: [pokemon.typechart(), typeWeak(pokemon.types, pokemon.ruleset)],
      types: pokemon.types,
    })),
    teraTypes: teraTypes,
  };
}
