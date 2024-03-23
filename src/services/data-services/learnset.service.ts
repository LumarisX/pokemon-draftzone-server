import { Generation, ID } from "@pkmn/data";
import { Learnsets } from "../../data/learnsets";
import { PokemonId } from "../../data/pokedex";

export async function getLearnset(gen: Generation, pid: ID) {
  return (await gen.dex.learnsets.getByID(pid)).learnset;
}

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
  let can = await gen.learnsets.canLearn(pokemonID, moveId);
  return can;
}
