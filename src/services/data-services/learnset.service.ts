import { Generation, ID } from "@pkmn/data";
import { Learnsets } from "../../data/learnsets";
import { Pokedex, PokemonId } from "../../data/pokedex";

export function getLearnset(gen: Generation, pid: ID): string[] {
  let totalLearnset: string[] = [];
  if (Learnsets.hasOwnProperty(pid)) {
    if ("learnset" in Learnsets[pid]) {
      let learnset = Learnsets[pid].learnset;
      if (learnset !== undefined) {
        const filteredLearnset = Object.keys(learnset).filter((moveId) => {
          if (learnset !== undefined) {
            genCheck(gen, learnset[moveId]);
          }
        });
        totalLearnset.push(...filteredLearnset);
      }
    } else {
      const base = Pokedex[pid].baseSpecies;
      if (base !== undefined) {
        if ("learnset" in Learnsets[pid]) {
          let learnset = Learnsets[base].learnset;
          if (learnset !== undefined) {
            const filteredLearnset = Object.keys(learnset).filter((moveId) => {
              if (learnset !== undefined) {
                genCheck(gen, learnset[moveId]);
              }
            });
            totalLearnset.push(...filteredLearnset);
          }
        }
      }
    }
  }
  return totalLearnset;
}

// export function findLearnset(pid: PokemonId, gen: string): string[] {
//   if (pid === "") return [];
//   if (hasLearnset(pid)) {
//     let learnset = Learnsets[pid].learnset ?? {};
//     const filteredLearnset = Object.keys(learnset).filter((moveId) =>
//       genCheck(learnset[moveId], gen)
//     );
//     return filteredLearnset;
//   } else {
//     console.log(pid);
//     return findLearnset(toKey(Pokedex[pid].baseSpecies) ?? "", gen);
//   }
// }

// export function getLearnset(pid: PokemonId, gen: string) {
//   let learnset = findLearnset(pid, gen);
//   function addMovesFromSubLearnset(subLearnset: string[] | undefined) {
//     if (subLearnset) {
//       learnset = [...new Set(learnset?.concat(subLearnset))];
//     }
//   }
//   addMovesFromSubLearnset(getLearnset(toKey(Pokedex[pid]?.prevo), gen));
//   addMovesFromSubLearnset(getLearnset(toKey(Pokedex[pid]?.changesFrom), gen));

//   const battleOnly = Pokedex[pid]?.battleOnly;
//   if (battleOnly) {
//     if (typeof battleOnly === "string") {
//       addMovesFromSubLearnset(getLearnset(toKey(battleOnly), gen));
//     } else if (Array.isArray(battleOnly)) {
//       for (const item of battleOnly) {
//         addMovesFromSubLearnset(getLearnset(toKey(item), gen));
//       }
//     }
//   }
//   return learnset;
// }

export function inLearnset(
  gen: Generation,
  pid: PokemonId,
  moveId: string
): boolean {
  return genCheck(gen, Learnsets[pid]?.learnset?.[moveId] ?? {});
}

function genCheck(gen: Generation, move: { [key: string]: any }): boolean {
  return Object.values(move).some((value) => {
    const genReg = new RegExp("^[" + gen + "]\\D");
    return genReg.test(value);
  });
}

export function hasLearnset(pid: PokemonId) {
  return Learnsets[pid] && Learnsets[pid].learnset;
}

export async function canLearn(gen: Generation, pokemonID: ID, moveId: ID) {
  return await gen.learnsets.canLearn(pokemonID, moveId);
}
