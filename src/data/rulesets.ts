import { Generation, Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export type RulesetId = keyof typeof Rulesets;

export type Ruleset = {
  gen: Generation;
  natdex: boolean;
};

type Rulesets = {
  [key: string]: Ruleset;
};

const gens = new Generations(Dex);

export const Rulesets: Rulesets = {
  "Gen9 NatDex": { gen: gens.get(9), natdex: true },
  "Paldea Dex": { gen: gens.get(9), natdex: false },
  "Gen8 NatDex": { gen: gens.get(8), natdex: true },
  "Galar Dex": { gen: gens.get(8), natdex: false },
  "Gen7 NatDex": { gen: gens.get(7), natdex: true },
  "Alola Dex": { gen: gens.get(7), natdex: false },
  "Gen6 NatDex": { gen: gens.get(6), natdex: true },
  "Kalos Dex": { gen: gens.get(6), natdex: false },
  "Gen5 NatDex": { gen: gens.get(5), natdex: true },
  "Unova Dex": { gen: gens.get(5), natdex: false },
  "Gen4 NatDex": { gen: gens.get(4), natdex: true },
  "Sinnoh Dex": { gen: gens.get(4), natdex: false },
  "Gen3 NatDex": { gen: gens.get(3), natdex: true },
  "Hoenn Dex": { gen: gens.get(3), natdex: false },
  "Gen2 NatDex": { gen: gens.get(2), natdex: true },
  "Johto Dex": { gen: gens.get(2), natdex: false },
  "Kanto Dex": { gen: gens.get(1), natdex: false },
  CAP: { gen: gens.get(9), natdex: true },
};
