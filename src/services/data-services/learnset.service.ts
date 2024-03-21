import { Learnsets } from "../../data/learnsets";
import { Pokedex, PokemonId } from "../../data/pokedex";
import { toKey } from "./pokedex.service";

export function getLearnset(pid: PokemonId, gen: string): string[] {
  if (hasLearnset(pid)) {
    let learnset = Learnsets[pid].learnset ?? {};
    const filteredLearnset = Object.keys(learnset).filter((moveId) =>
      genCheck(learnset[moveId], gen)
    );
    return filteredLearnset;
  } else {
    return getLearnset(toKey(Pokedex[pid].baseSpecies ?? ""), gen);
  }
}

export function inLearnset(
  pid: PokemonId,
  moveId: string,
  gen: string
): boolean {
  return genCheck(Learnsets[pid]?.learnset?.[moveId] ?? {}, gen);
}

function genCheck(move: { [key: string]: any }, gen: string): boolean {
  return Object.values(move).some((value) => {
    const genReg = new RegExp("^[" + gen + "]\\D");
    return genReg.test(value);
  });
}

export function hasLearnset(pid: PokemonId) {
  return Learnsets[pid] && Learnsets[pid].learnset;
}
