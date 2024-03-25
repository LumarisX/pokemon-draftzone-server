import { ID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";

export async function getLearnset(
  ruleset: Ruleset,
  pid: ID
): Promise<{ [moveid: string]: string[] }> {
  let learnset = await ruleset.gen.learnsets.learnable(pid);
  if (!ruleset.natdex && learnset) {
    learnset = Object.fromEntries(
      Object.entries(learnset).filter(([move, types]) => {
        const genReg = new RegExp("^[" + ruleset.gen.num + "]\\D");
        return genReg.test(types[0]);
      })
    );
  }

  return learnset || {};
}

export async function hasLearnset(ruleset: Ruleset, pid: ID) {
  return (await ruleset.gen.learnsets.learnable(pid)) !== undefined;
}

export async function canLearn(ruleset: Ruleset, pokemonID: ID, moveId: ID) {
  if (ruleset.natdex) {
    return await ruleset.gen.learnsets.canLearn(pokemonID, moveId);
  }
  let learnset = await ruleset.gen.learnsets.learnable(pokemonID);
  if (
    learnset &&
    learnset.hasOwnProperty(moveId) &&
    learnset[moveId][0].charAt(0) == ruleset.gen.num.toString()
  ) {
    return true;
  }

  return false;
}
