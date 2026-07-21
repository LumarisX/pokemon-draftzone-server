import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ID } from "@pkmn/data";

function typeWeakPair(pokemon: PDZPokemon) {
  return [pokemon.typechart(), PDZPokemon.typeWeak(pokemon.types, pokemon.ruleset)] as const;
}

function getFormeTypechart(id: ID, ruleset: PDZPokemon["ruleset"]) {
  const forme = PDZPokemon.tryCreate(id, ruleset);
  if (!forme) return { id, name: id };
  return {
    id,
    name: forme.name,
    types: forme.types,
    weak: typeWeakPair(forme),
  };
}

export function getTeamTypechart(team: PDZPokemon[]) {
  const teraTypes: {
    [key: string]: {};
  } = {};
  return {
    team: team.map((pokemon) => ({
      ...PokemonMapper.toClientPayload(pokemon),
      weak: typeWeakPair(pokemon),
      types: pokemon.types,
      draftFormes: pokemon.draftFormes?.map((id) =>
        getFormeTypechart(id, pokemon.ruleset),
      ),
    })),
    teraTypes: teraTypes,
  };
}
