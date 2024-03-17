import { PokemonId } from "../../public/data/pokedex";
import { Learnsets } from "../../public/data/learnsets";

export function getLearnset(pid: PokemonId, gen: string): string[] {
  let ls = Learnsets[pid].learnset ?? {};
  for (let m in ls) {
    if (!genCheck(ls[m], gen)) {
      delete ls[m];
    }
  }
  return Object.keys(ls);
}

export function inLearnset(
  pid: PokemonId,
  moveId: string,
  gen: string
): boolean {
  return genCheck(Learnsets[pid]?.learnset?.[moveId] ?? {}, gen);
}

function genCheck(move: { [key: string]: any }, gen: string): boolean {
  for (let lk in move) {
    let genReg = new RegExp("^[" + gen + "]\\D");
    if (genReg.test(move[lk])) {
      return true;
    }
  }
  return false;
}
