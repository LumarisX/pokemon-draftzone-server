export type RulesetId = keyof typeof Rulesets;

type Rulesets = {
  [key: string]: {
    gen: number;
    natdex: boolean;
  };
};

export const Rulesets: Rulesets = {
  "Gen9 NatDex": { gen: 9, natdex: true },
  "Paldea Dex": { gen: 9, natdex: false },
  "Gen8 NatDex": { gen: 8, natdex: true },
  "Galar Dex": { gen: 8, natdex: false },
  "Gen7 NatDex": { gen: 7, natdex: true },
  "Alola Dex": { gen: 7, natdex: false },
  "Gen6 NatDex": { gen: 6, natdex: true },
  "Kalos Dex": { gen: 6, natdex: false },
  "Gen5 NatDex": { gen: 5, natdex: true },
  "Unova Dex": { gen: 5, natdex: false },
  "Gen4 NatDex": { gen: 4, natdex: true },
  "Sinnoh Dex": { gen: 4, natdex: false },
  "Gen3 NatDex": { gen: 3, natdex: true },
  "Hoenn Dex": { gen: 3, natdex: false },
  "Gen2 NatDex": { gen: 2, natdex: true },
  "Johto Dex": { gen: 2, natdex: false },
  "Kanto Dex": { gen: 1, natdex: false },
  CAP: { gen: 9, natdex: true },
};
