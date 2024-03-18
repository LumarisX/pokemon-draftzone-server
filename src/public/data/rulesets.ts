export type RulesetId = keyof typeof Rulesets;

type Rulesets = {
  [key: string]: {
    gen: string;
  };
};

export const Rulesets = {
  "Gen9 NatDex": { gen: "1-9" },
  "Paldea Dex": { gen: "9" },
  "Gen8 NatDex": { gen: "1-8" },
  "Galar Dex": { gen: "8" },
  "Gen7 NatDex": { gen: "1-7" },
  "Alola Dex": { gen: "7" },
  "Gen6 NatDex": { gen: "1-6" },
  "Kalos Dex": { gen: "6" },
  "Gen5 NatDex": { gen: "1-5" },
  "Unova Dex": { gen: "5" },
  "Gen4 NatDex": { gen: "1-4" },
  "Sinnoh Dex": { gen: "4" },
  "Gen3 NatDex": { gen: "1-3" },
  "Hoenn Dex": { gen: "3" },
  "Gen2 NatDex": { gen: "1-2" },
  "Johto Dex": { gen: "2" },
  "Kanto Dex": { gen: "1" },
  CAP: { gen: "1-9" },
};
