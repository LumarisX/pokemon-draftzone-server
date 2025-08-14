import { Data, Generation, ID } from "@pkmn/data";
import { Dex, ModData, ModdedDex } from "@pkmn/dex";
import * as RRDex from "../mods/radicalred";
import * as InsDex from "../mods/insurgance";

const NATDEX_UNOBTAINABLE_SPECIES = [
  "Pichu-Spiky-eared",
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

type ExistFilter = {
  nonstandard?: string[];
  species?: {
    unobtainable?: string[];
    cosmetic?: string[];
  };
};

function _exists(d: Data, filters: ExistFilter = {}) {
  if (!d.exists) return false;
  if (d.kind === "Ability" && d.id === "noability") return false;
  if ("isNonstandard" in d && d.isNonstandard) {
    if ("tier" in d && d.tier === "Unreleased") return false;
    if (filters.nonstandard && filters.nonstandard.includes(d.isNonstandard)) {
      return false;
    }
    if (
      d.kind === "Move" &&
      d.isNonstandard !== "Past" &&
      d.isNonstandard !== "Unobtainable"
    ) {
      return false;
    }
  }
  if (d.kind === "Species") {
    if (d.forme === "Totem" || d.forme === "Alola-Totem") return false;
    if (filters.species) {
      if (
        filters.species.unobtainable &&
        filters.species.unobtainable.includes(d.name)
      )
        return false;
      if (filters.species.cosmetic && filters.species.cosmetic.includes(d.name))
        return false;
    }
  }

  if (
    d.kind === "Item" &&
    d.isNonstandard &&
    ["Past", "Unobtainable"].includes(d.isNonstandard) &&
    !d.zMove &&
    !d.itemUser &&
    !d.forcedForme
  ) {
    return false;
  }
  return true;
}

function ROM_EXISTS(d: Data) {
  return _exists(d, {
    nonstandard: ["CAP", "Custom", "Future"],
  });
}

function NATDEX_EXISTS(d: Data) {
  return _exists(d, {
    nonstandard: ["CAP", "Custom", "Future"],
    species: {
      unobtainable: NATDEX_UNOBTAINABLE_SPECIES,
      cosmetic: COSMETIC_SPECIES,
    },
  });
}

function CAP_EXISTS(d: Data) {
  return _exists(d, {
    nonstandard: ["Custom", "Future"],
    species: {
      unobtainable: NATDEX_UNOBTAINABLE_SPECIES,
      cosmetic: COSMETIC_SPECIES,
    },
  });
}

function DRAFT_EXISTS(d: Data) {
  if (!NATDEX_EXISTS(d)) return false;
  if ("isNonstandard" in d && d.isNonstandard) return false;
  return !("tier" in d && ["Illegal"].includes(d.tier));
}

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
  | "Sword/Shield"
  | "radicalred"
  | "insurgance"
  | "CAP Gen 9";

export class Ruleset extends Generation {
  name: RulesetId;
  restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea";
  isNatDex: boolean;
  constructor(
    dex: ModdedDex,
    exists: (d: Data) => boolean,
    name: RulesetId,
    options?: { restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea" }
  ) {
    super(dex, exists);
    this.name = name;
    this.restriction = options?.restriction;
    this.isNatDex = this.exists === NATDEX_EXISTS;
  }
}

export const Rulesets: {
  [key: string]: {
    [key: string]: {
      desc?: string;
      id: RulesetId;
      ruleset: Ruleset;
    };
  };
} = {
  "Gen 9": {
    "National Dex": {
      id: "Gen9 NatDex",
      desc: "Only available Generation 9 and before",
      ruleset: new Ruleset(
        Dex.forGen(9),
        (d: Data) =>
          !(!NATDEX_EXISTS(d) || (d.kind === "Species" && d.forme === "Gmax")),
        "Gen9 NatDex"
      ),
    },
    "Paldea Dex": {
      id: "Paldea Dex",
      desc: "Only available in the Paldea Dex",
      ruleset: new Ruleset(Dex.forGen(9), DRAFT_EXISTS, "Paldea Dex", {
        restriction: "Paldea",
      }),
    },
  },
  //Lazy-loaded since not frequently accessed
  "Gen 8": {
    "National Dex": {
      id: "Gen8 NatDex",
      desc: "All available Generation 8 and before",
      get ruleset() {
        return new Ruleset(Dex.forGen(8), NATDEX_EXISTS, this.id);
      },
    },
    "Sword/Shield": {
      id: "Sword/Shield",
      desc: "All available to be transfered to Sword/Shield",
      get ruleset() {
        return new Ruleset(Dex.forGen(8), DRAFT_EXISTS, this.id);
      },
    },
    "Galar Dex": {
      id: "Galar Dex",
      desc: "Only available in the Galar Dex",
      get ruleset() {
        return new Ruleset(Dex.forGen(8), DRAFT_EXISTS, this.id, {
          restriction: "Galar",
        });
      },
    },
  },
  "Older Gens": {
    "Generation 7": {
      id: "Alola Dex",
      desc: "All available Generation 7 and before",
      get ruleset() {
        return new Ruleset(Dex.forGen(7), DRAFT_EXISTS, this.id);
      },
    },
    "Generation 6": {
      id: "Kalos Dex",
      desc: "All available Generation 6 and before",
      get ruleset() {
        return new Ruleset(Dex.forGen(6), DRAFT_EXISTS, this.id);
      },
    },
    "Generation 5": {
      id: "Unova Dex",
      desc: "All available Generation 5 and before",
      get ruleset() {
        return new Ruleset(Dex.forGen(5), DRAFT_EXISTS, this.id);
      },
    },
    "Generation 4": {
      id: "Sinnoh Dex",
      desc: "All available Generation 4 and before",
      get ruleset() {
        return new Ruleset(Dex.forGen(4), DRAFT_EXISTS, this.id);
      },
    },
    "Generation 3": {
      id: "Hoenn Dex",
      desc: "All available Generation 3 and before",
      get ruleset() {
        return new Ruleset(Dex.forGen(3), DRAFT_EXISTS, this.id);
      },
    },
    "Generation 2": {
      id: "Johto Dex",
      desc: "All available Generation 2 and before",
      get ruleset() {
        return new Ruleset(Dex.forGen(2), DRAFT_EXISTS, this.id);
      },
    },
    "Generation 1": {
      id: "Kanto Dex",
      desc: "All available Generation 1",
      get ruleset() {
        return new Ruleset(Dex.forGen(1), DRAFT_EXISTS, this.id);
      },
    },
  },
  // TODO: Fix these IDs to be properly capiolized (update db instances)
  "Rom Hacks": {
    "Radical Red": {
      id: "radicalred",
      desc: "All pokemon from the Radical Red rom hack",
      get ruleset() {
        let mod = new ModdedDex("radicalred" as ID, RRDex as ModData);
        return new Ruleset(mod, ROM_EXISTS, this.id);
      },
    },
    Insurgance: {
      id: "insurgance",
      desc: "All pokemon from the Insurgance rom hack",
      get ruleset() {
        let mod = new ModdedDex("insurgance" as ID, InsDex as ModData);
        return new Ruleset(mod, ROM_EXISTS, this.id);
      },
    },
  },
  CAP: {
    "Generation 9": {
      id: "CAP Gen 9",
      desc: "All pokemon in Gen 9 and CAP pokemon",
      get ruleset() {
        return new Ruleset(
          Dex.forGen(9),
          (d: Data) =>
            !(!CAP_EXISTS(d) || (d.kind === "Species" && d.forme === "Gmax")),
          this.id
        );
      },
    },
  },
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
  return [Rulesets["Gen 9"], Rulesets["Gen 8"], Rulesets["Older Gens"]].flatMap(
    (rulesetgroup) => Object.values(rulesetgroup).map((ruleset) => ruleset.id)
  );
}

export function getRulesetsGrouped(): [
  string,
  { name: string; id: string }[]
][] {
  return Object.entries(Rulesets).map(([groupName, rulesetgroup]) => [
    groupName,
    Object.entries(rulesetgroup).flatMap(([rulesetName, rulesetData]) => ({
      name: rulesetName,
      id: rulesetData.id,
      desc: rulesetData.desc,
    })),
  ]);
}
