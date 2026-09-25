import { getName } from "@modules/data/domain/pokedex";
import { TierList } from "@modules/tier-list/tier-list.domain";

export function rosterRow(
  pokemon: { id: string; addons?: string[] },
  tierList: TierList,
) {
  return {
    id: pokemon.id,
    name: getName(pokemon.id),
    cost: tierList.getPokemonCost(pokemon.id, pokemon.addons),
    draftFormes: tierList.getPokemonFormes(pokemon.id),
    ...(tierList.hasPokemon(pokemon.id)
      ? {}
      : { missingFromTierList: true as const }),
  };
}

export function captainRosterRow(
  pokemon: { id: string; addons?: string[] },
  tierList: TierList,
) {
  return {
    ...rosterRow(pokemon, tierList),
    capt: { tera: pokemon.addons?.includes("Tera Captain") },
  };
}
