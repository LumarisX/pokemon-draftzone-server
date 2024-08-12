import { ID, Move, toID, TypeName } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { getEffectivePower } from "./move.service";
import { DraftSpecie } from "../../classes/pokemon";

export async function getLearnset(
  mon: DraftSpecie,
  ruleset: Ruleset
): Promise<Move[]> {
  let restriction = undefined;
  const moves: Move[] = [];
  for await (const learnset of all(mon)) {
    for (const moveid in learnset.learnset) {
      const move = mon.dex.moves.get(moveid);
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
            moves[move].push(...unique);
          } else {
            moves[move.id] = filtered;
          }
        }
      }
    }
  }
  return moves;
}

export async function getCoverage(mon: DraftSpecie, ruleset: Ruleset) {
  let learnset = await getLearnset(mon, ruleset);
  let coverage: {
    Physical: {
      [key: string]: Move & { stab: boolean; ePower: number };
    };
    Special: {
      [key: string]: Move & { stab: boolean; ePower: number };
    };
    teraBlast?: true;
  } = { Physical: {}, Special: {} };
  if (learnset.terablast && mon.capt?.tera) {
    for (const type of mon.capt.tera) {
      coverage.Physical[type] = {
        id: "terablast" as ID,
        ePower: -1,
        type: type,
        stab: mon.types.includes(type),
      };
      coverage.Special[type] = {
        id: "terablast" as ID,
        ePower: -1,
        type: type,
        stab: mon.types.includes(type),
      };
    }
  }
  for (const moveID in learnset) {
    let move = ruleset.gen.moves.get(moveID);
    if (!move) continue;
    if (move.category !== "Status") {
      const ePower = getEffectivePower(move);
      if (
        !(move.type in coverage[move.category]) ||
        coverage[move.category][move.type].ePower < ePower
      ) {
        coverage[move.category][move.type] = {
          ...move,
          ePower: ePower,
          stab: mon.types.includes(move.type),
        };
      }
    }
  }
  return {
    physical: Object.values(coverage.Physical),
    special: Object.values(coverage.Special),
  };
}

export function learns(
  mon: DraftSpecie,
  moveID: string,
  ruleset: Ruleset
): boolean {
  let learns = false;
  getLearnset(mon, ruleset).then((learnset) => {
    learns = Object.keys(learnset).includes(moveID);
  });
  return learns;
}

export async function* all(mon: DraftSpecie) {
  let id = mon.id;
  let learnset = await mon.dex.learnsets.get(id);
  if (!learnset) {
    id =
      typeof mon.battleOnly === "string" && mon.battleOnly !== mon.baseSpecies
        ? toID(mon.battleOnly)
        : toID(mon.baseSpecies);
    learnset = await mon.dex.learnsets.get(id);
  }
  while (learnset) {
    yield learnset;
    if (id === "lycanrocdusk" || (mon.id === "rockruff" && id === "rockruff")) {
      id = "rockruffdusk" as ID;
    } else if (mon.id === ("gastrodoneast" as ID)) {
      id = "gastrodon" as ID;
    } else if (mon.id === ("pumpkaboosuper" as ID)) {
      id = "pumpkaboo" as ID;
    } else {
      id = toID(mon.battleOnly || mon.changesFrom || mon.prevo);
    }
    if (!id) break;
    const s = mon.dex.species.get(id);
    if (!s) break;
    learnset = await mon.dex.learnsets.get(id);
  }
}
