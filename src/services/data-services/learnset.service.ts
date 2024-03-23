import { Generation, ID } from "@pkmn/data";
import { Learnsets } from "../../data/learnsets";
import { PokemonId } from "../../data/pokedex";

export async function getLearnset(gen: Generation, pid: ID) {
  let learnset = await gen.learnsets.learnable(pid);
  if (true) {
    let localLearnset: { [key: string]: string[] } = {};
    for (let move in learnset) {
      if (genCheck(gen, learnset[move])) {
        localLearnset[move] = learnset[move];
      }
    }
    learnset = localLearnset;
  }
  return learnset;
}

function genCheck(gen: Generation, move: string[]): boolean {
  const genReg = new RegExp("^[" + gen.num + "]\\D");
  return genReg.test(move[0]);
}

export function hasLearnset(pid: PokemonId) {
  return Learnsets[pid] && Learnsets[pid].learnset;
}

export async function canLearn(gen: Generation, pokemonID: ID, moveId: ID) {
  return await gen.learnsets.canLearn(pokemonID, moveId);
}
