import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";
import { DraftMove } from "../../../classes/move";
import { DraftPokemonMapper } from "@modules/draft-pokemon/draft-pokemon.mapper";

export async function getTeamMoves(team: DraftPokemon[]) {
  const combinedLearnset = new Map<
    string,
    {
      move: DraftMove;
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
    pokemon: team.map(DraftPokemonMapper.toClientPayload),
    tags: Array.from(allTags).sort(),
  };
}
