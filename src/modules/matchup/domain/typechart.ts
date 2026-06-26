import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";

export function getTeamTypechart(team: PDZPokemon[]) {
  const teraTypes: {
    [key: string]: {};
  } = {};
  return {
    team: team.map((pokemon) => ({
      ...PokemonMapper.toClientPayload(pokemon),
      weak: [
        pokemon.typechart(),
        PDZPokemon.typeWeak(pokemon.types, pokemon.ruleset),
      ],
      types: pokemon.types,
    })),
    teraTypes: teraTypes,
  };
}
