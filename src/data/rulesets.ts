import { Data, Generation } from "@pkmn/data";
import { Dex, ModdedDex } from "@pkmn/dex";

const NATDEX_UNOBTAINABLE_SPECIES = [
  "Eevee-Starter",
  "Floette-Eternal",
  "Pichu-Spiky-eared",
  "Pikachu-Belle",
  "Pikachu-Cosplay",
  "Pikachu-Libre",
  "Pikachu-PhD",
  "Pikachu-Pop-Star",
  "Pikachu-Rock-Star",
  "Pikachu-Starter",
  "Eternatus-Eternamax",
];

const COSMETIC_SPECIES = [
  "Maushold-Four",
  "Sinistea-Antique",
  "Polteageist-Antique",
  "Dudunsparce-Three-Segment",
  "Poltchageist-Artisan",
  "Sinistcha-Masterpiece",
  "Magearna-Original",
  "Pikachu-Original",
  "Pikachu-Hoenn",
  "Pikachu-Sinnoh",
  "Pikachu-Unova",
  "Pikachu-Kalos",
  "Pikachu-Alola",
  "Pikachu-Partner",
  "Pikachu-World",
  "Basculin-Blue-Striped",
  "Vivillon-Pokeball",
  "Vivillon-Fancy",
  "Cramorant-Gorging",
  "Ogerpon-Teal-Tera",
  "Ogerpon-Hearthflame-Tera",
  "Ogerpon-Cornerstone-Tera",
  "Ogerpon-Wellspring-Tera",
  "Tatsugiri-Stretchy",
  "Tatsugiri-Droopy",
];

const DRAFT_EXISTS = (d: Data) => {
  if (!NATDEX_EXISTS(d)) return false;
  if ("isNonstandard" in d && d.isNonstandard) return false;
  return !("tier" in d && ["Illegal"].includes(d.tier));
};

const NATDEX_EXISTS = (d: Data) => {
  if (!d.exists) return false;
  if (d.kind === "Ability" && d.id === "noability") return false;
  if ("isNonstandard" in d && d.isNonstandard && d.isNonstandard !== "Past") {
    if ("tier" in d && d.tier === "Unreleased") return false;
    if (d.isNonstandard === "CAP") return false;
    if (d.isNonstandard === "Custom") return false;
  }
  if (
    d.kind === "Move" &&
    d.isNonstandard &&
    d.isNonstandard !== "Past" &&
    d.isNonstandard !== "Unobtainable"
  ) {
    return false;
  }
  if (
    d.kind === "Species" &&
    (NATDEX_UNOBTAINABLE_SPECIES.includes(d.name) ||
      COSMETIC_SPECIES.includes(d.name) ||
      // (d.battleOnly &&
      //   !(
      //     d.forme == "Mega" ||
      //     d.forme == "Mega-X" ||
      //     d.forme == "Mega-Y" ||
      //     d.forme == "Crowned"
      //   )) ||
      d.forme === "Totem" ||
      d.forme === "Alola-Totem")
  )
    return false;
  return !(
    d.kind === "Item" &&
    ["Past", "Unobtainable"].includes(d.isNonstandard!) &&
    !d.zMove &&
    !d.itemUser &&
    !d.forcedForme
  );
};

// const Rulesets = {
//   "Gen9 NatDex": {
//     dex: Dex.forGen(9),
//     existFn: (d: Data) => {
//       if (!NATDEX_EXISTS(d)) return false;
//       if (d.kind === "Species" && d.forme === "Gmax") return false;
//       return true;
//     },
//     restriction: undefined,
//   },
//   "Paldea Dex": {
//     dex: Dex.forGen(9),
//     existFn: DRAFT_EXISTS,
//     restriction: "Paldea",
//   },
//   "Gen8 NatDex": {
//     dex: Dex.forGen(8),
//     existFn: NATDEX_EXISTS,
//     restriction: undefined,
//   },
//   "Galar Dex": {
//     dex: Dex.forGen(8),
//     existFn: DRAFT_EXISTS,
//     restriction: "Galar",
//   },
//   "Alola Dex": {
//     dex: Dex.forGen(7),
//     existFn: DRAFT_EXISTS,
//     restriction: undefined,
//   },
//   "Kalos Dex": {
//     dex: Dex.forGen(6),
//     existFn: DRAFT_EXISTS,
//     restriction: undefined,
//   },
//   "Unova Dex": {
//     dex: Dex.forGen(5),
//     existFn: DRAFT_EXISTS,
//     restriction: undefined,
//   },
//   "Sinnoh Dex": {
//     dex: Dex.forGen(4),
//     existFn: DRAFT_EXISTS,
//     restriction: undefined,
//   },
//   "Hoenn Dex": {
//     dex: Dex.forGen(3),
//     existFn: DRAFT_EXISTS,
//     restriction: undefined,
//   },
//   "Johto Dex": {
//     dex: Dex.forGen(2),
//     existFn: DRAFT_EXISTS,
//     restriction: undefined,
//   },
//   "Kanto Dex": {
//     dex: Dex.forGen(1),
//     existFn: DRAFT_EXISTS,
//     restriction: undefined,
//   },
//   // "Insurgance Dex": {
//   //   dex: Dex.mod("insurgance" as ID, insurganceMod as ModData),
//   //   existFn: DRAFT_EXISTS,
//   //   restriction: undefined,
//   // },
//   // CAP: { gen: gens.get(9), natdex: true },
// } as const;

export type RulesetId =
  | "Gen9 NatDex"
  | "Paldea Dex"
  | "Gen8 NatDex"
  | "Galar Dex"
  | "Alola Dex"
  | "Kalos Dex"
  | "Unova Dex"
  | "Sinnoh Dex"
  | "Hoenn Dex"
  | "Johto Dex"
  | "Kanto Dex"
  | "Sword/Shield";

export class Ruleset extends Generation {
  name: string;
  restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea";
  constructor(
    dex: ModdedDex,
    exists: (d: Data) => boolean,
    name: RulesetId,
    options?: { restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea" }
  ) {
    super(dex, exists);
    this.name = name;
    this.restriction = options?.restriction;
  }
}

export const Rulesets: {
  [key: string]: {
    [key: string]: {
      id: RulesetId;
      ruleset: Ruleset;
    };
  };
} = {
  "Gen 9": {
    "National Dex": {
      id: "Gen9 NatDex",
      ruleset: new Ruleset(
        Dex.forGen(9),
        (d: Data) =>
          !(!NATDEX_EXISTS(d) || (d.kind === "Species" && d.forme === "Gmax")),
        "Gen9 NatDex"
      ),
    },
    "Paldea Dex": {
      id: "Paldea Dex",
      ruleset: new Ruleset(Dex.forGen(9), DRAFT_EXISTS, "Paldea Dex", {
        restriction: "Paldea",
      }),
    },
  },
  //Lazy-loaded since not frequently accessed
  "Gen 8": {
    "National Dex": {
      id: "Gen8 NatDex",
      get ruleset() {
        return new Ruleset(Dex.forGen(8), NATDEX_EXISTS, this.id);
      },
    },
    "Galar Dex": {
      id: "Galar Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(8), DRAFT_EXISTS, this.id, {
          restriction: "Galar",
        });
      },
    },
    "Sword/Shield": {
      id: "Sword/Shield",
      get ruleset() {
        return new Ruleset(Dex.forGen(8), DRAFT_EXISTS, this.id);
      },
    },
  },
  "Older Gens": {
    "Alola Dex": {
      id: "Alola Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(7), DRAFT_EXISTS, this.id);
      },
    },
    "Kalos Dex": {
      id: "Kalos Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(6), DRAFT_EXISTS, this.id);
      },
    },
    "Unova Dex": {
      id: "Unova Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(5), DRAFT_EXISTS, this.id);
      },
    },
    "Sinnoh Dex": {
      id: "Sinnoh Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(4), DRAFT_EXISTS, this.id);
      },
    },
    "Hoenn Dex": {
      id: "Hoenn Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(3), DRAFT_EXISTS, this.id);
      },
    },
    "Johto Dex": {
      id: "Johto Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(2), DRAFT_EXISTS, this.id);
      },
    },
    "Kanto Dex": {
      id: "Kanto Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(1), DRAFT_EXISTS, this.id);
      },
    },
  },
  // "Rom Hacks": {},
};

export function getRuleset(rulesetId: string): Ruleset {
  for (const groupKey in Rulesets) {
    for (const rulesetKey in Rulesets[groupKey]) {
      if (Rulesets[groupKey][rulesetKey].id === rulesetId)
        return Rulesets[groupKey][rulesetKey].ruleset;
    }
  }
  throw new Error(`Ruleset Id not found: ${rulesetId}`);
}

export function getRulesets() {
  return Object.values(Rulesets).flatMap((rulesetgroup) =>
    Object.values(rulesetgroup).map((ruleset) => ruleset.id)
  );
}
