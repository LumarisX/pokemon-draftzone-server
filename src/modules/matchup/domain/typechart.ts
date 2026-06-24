import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";
import { DraftPokemonMapper } from "@modules/draft-pokemon/draft-pokemon.mapper";

export function getTeamTypechart(team: DraftPokemon[]) {
  const teraTypes: {
    [key: string]: {};
  } = {};
  return {
    team: team.map((pokemon) => ({
      ...DraftPokemonMapper.toClientPayload(pokemon),
      weak: [
        pokemon.typechart(),
        DraftPokemon.typeWeak(pokemon.types, pokemon.ruleset),
      ],
      types: pokemon.types,
    })),
    teraTypes: teraTypes,
  };
}
