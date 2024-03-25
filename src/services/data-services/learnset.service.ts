import { ID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";

export async function getLearnset(ruleset: Ruleset, pid: ID) {
  let learnset = await ruleset.gen.learnsets.learnable(pid);
  if (true) {
    let localLearnset: { [key: string]: string[] } = {};
    for (let move in learnset) {
      if (genCheck(ruleset, learnset[move])) {
        localLearnset[move] = learnset[move];
      }
    }
    learnset = localLearnset;
  }
  return learnset;
}

function genCheck(ruleset: Ruleset, move: string[]): boolean {
  const genReg = new RegExp("^[" + ruleset.gen.num + "]\\D");
  return genReg.test(move[0]);
}

export async function hasLearnset(ruleset: Ruleset, pid: ID) {
  return (await ruleset.gen.learnsets.learnable(pid)) !== undefined;
}

export async function canLearn(ruleset: Ruleset, pokemonID: ID, moveId: ID) {
  return await ruleset.gen.learnsets.canLearn(pokemonID, moveId);
}
