import { TypeName } from "@pkmn/data";
import { DraftMove } from "../../classes/move";
import { DraftSpecie, PokemonFormData } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";

export type Movechart = {
  moves: {
    name: string;
    type: TypeName;
    desc: string;
    pokemon: string[];
    tags: string[];
  }[];
  pokemon: PokemonFormData[];
  tags: ReadonlyArray<string>;
};

export async function movechart(
  team: DraftSpecie[],
  ruleset: Ruleset,
): Promise<Movechart> {
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

  // for (let move of ruleset.moves) {
  //   const tags = getMoveTags(move);
  //   if (tags.size) console.log(`${move.name}: ${Array.from(tags).join(", ")}`);
  // }
  // console.log();

  // console.log(ruleset.moves.get("explosion"));

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
    pokemon: team.map((p) => p.toClient()),
    tags: Array.from(allTags).sort(),
  };
}
