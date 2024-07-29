import { Generations, ID, toID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { Species } from "@pkmn/dex-types/index";
import { Dex } from "@pkmn/dex";

export async function getLearnset(
  pid: ID,
  ruleset: Ruleset = { gen: new Generations(Dex).get(9), natdex: true }
): Promise<{ [moveid: string]: string[] }> {
  let restriction = undefined;
  let species = ruleset.gen.dex.species.get(pid);
  const moves: { [key in ID]?: any } = {};
  if (species) {
    for await (const learnset of all(ruleset, species)) {
      for (const moveid in learnset.learnset) {
        const move = ruleset.gen.dex.moves.get(moveid);
        if (move) {
          const sources = learnset.learnset[moveid];
          if (
            ruleset.gen.learnsets.isLegal(
              move,
              sources,
              restriction || ruleset.gen
            )
          ) {
            let filtered = null;
            if (ruleset.natdex) {
              filtered = sources.filter((s) => +s.charAt(0) <= ruleset.gen.num);
            } else {
              filtered = sources.filter((s) => +s.charAt(0) == ruleset.gen.num);
            }
            if (!filtered.length) continue;
            if (moves[move.id]) {
              const unique = [];
              loop: for (const source of filtered) {
                const prefix = source.slice(0, 2);
                for (const s of moves[move.id])
                  if (s.startsWith(prefix)) continue loop;
                unique.push(source);
              }
              moves[move.id].push(...unique);
            } else {
              moves[move.id] = filtered;
            }
          }
        }
      }
    }
  }
  return moves;
}

async function* all(ruleset: Ruleset, species: Species) {
  let id = species.id;
  let learnset = await ruleset.gen.learnsets.get(id);
  if (!learnset) {
    id =
      typeof species.battleOnly === "string" &&
      species.battleOnly !== species.baseSpecies
        ? toID(species.battleOnly)
        : toID(species.baseSpecies);
    learnset = await ruleset.gen.learnsets.get(id);
  }
  while (learnset) {
    yield learnset;
    if (
      id === "lycanrocdusk" ||
      (species.id === "rockruff" && id === "rockruff")
    ) {
      id = "rockruffdusk" as ID;
    } else if (species.id === ("gastrodoneast" as ID)) {
      id = "gastrodon" as ID;
    } else if (species.id === ("pumpkaboosuper" as ID)) {
      id = "pumpkaboo" as ID;
    } else {
      id = toID(species.battleOnly || species.changesFrom || species.prevo);
    }
    if (!id) break;
    const s = ruleset.gen.dex.species.get(id);
    if (!s) break;
    species = s;
    learnset = await ruleset.gen.learnsets.get(id);
  }
}
