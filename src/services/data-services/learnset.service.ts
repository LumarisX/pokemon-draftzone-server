import { Learnsets } from "../../data/learnsets";
import { PokemonId } from "../../data/pokedex";

export function getLearnset(pid: PokemonId, gen: string): string[] {
  let learnset = Learnsets[pid].learnset ?? {};
  const filteredLearnset = Object.keys(learnset).filter((moveId) =>
    genCheck(learnset[moveId], gen)
  );
  return filteredLearnset;
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

export function hasLearnset(pokemonId: PokemonId) {
  return pokemonId in Learnsets && "learnset" in Learnsets[pokemonId];
}
