import { PDZMove } from "@modules/move/move.domain";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";

export async function getTeamMoves(team: PDZPokemon[]) {
  const combinedLearnset = new Map<
    string,
    {
      move: PDZMove;
      pokemon: string[];
    }
  >();

  const teamWithLearnsets = await Promise.all(
    team.map(async (pokemon) => ({
      pokemon,
      learnset: await pokemon.learnset(),
    })),
  );

  for (let { pokemon, learnset } of teamWithLearnsets) {
    for (let move of learnset) {
      if (!combinedLearnset.has(move.id)) {
        combinedLearnset.set(move.id, {
          move,
          pokemon: [],
        });
      }
      combinedLearnset.get(move.id)?.pokemon.push(pokemon.id);
    }
  }

  const allTags = new Set<string>();
  const moves = Array.from(combinedLearnset.values())
    .map(({ move, pokemon }) => {
      const tags = move.tags;
      tags.forEach((tag) => allTags.add(tag));
      return {
        ...move.toData(),
        tags: Array.from(tags),
        pokemon,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    moves,
    pokemon: team.map(PokemonMapper.toClientPayload),
    tags: Array.from(allTags).sort(),
  };
}
