import { Specie } from "@pkmn/data";

type WeaknessModifier = (
  weaknesses: { [key: string]: number },
  specie: Specie
) => void;

const immunityToPoison: WeaknessModifier = (weak) => {
  weak.psn = 0;
  weak.tox = 0;
};

const immunityToBurn: WeaknessModifier = (weak) => {
  weak.brn = 0;
};

const immunityToMajorStatus: WeaknessModifier = (weak) => {
  immunityToBurn(weak, null as any);
  weak.par = 0;
  weak.frz = 0;
  weak.slp = 0;
  immunityToPoison(weak, null as any);
};

const halfDamageFromFire: WeaknessModifier = (weak) => {
  weak.Fire *= 0.5;
};

const immunityToWater: WeaknessModifier = (weak) => {
  weak.Water = 0;
};

const immunityToSandstorm: WeaknessModifier = (weak) => {
  weak.sandstorm = 0;
};

const immunityToHail: WeaknessModifier = (weak) => {
  weak.hail = 0;
};

const superEffectiveResistance: WeaknessModifier = (weak) => {
  for (const type in weak) {
    if (weak[type] > 1) {
      weak[type] *= 0.75;
    }
  }
};

export const abilityModifiers: Partial<Record<string, WeaknessModifier>> = {
  Fluffy: (weak) => {
    weak.Fire *= 2;
  },
  "Dry Skin": (weak) => {
    weak.Fire *= 1.25;
    immunityToWater(weak, null as any);
  },
  "Water Absorb": immunityToWater,
  "Desolate Land": immunityToWater,
  "Storm Drain": immunityToWater,
  "Volt Absorb": (weak) => {
    weak.Electric = 0;
  },
  "Lightning Rod": (weak) => {
    weak.Electric = 0;
  },
  "Motor Drive": (weak) => {
    weak.Electric = 0;
  },
  "Flash Fire": (weak) => {
    weak.Fire = 0;
  },
  "Primordial Sea": (weak) => {
    weak.Fire = 0;
  },
  "Well-Baked Body": (weak) => {
    weak.Fire = 0;
  },
  "Sap Sipper": (weak) => {
    weak.Grass = 0;
  },
  Levitate: (weak) => {
    weak.Ground = 0;
  },
  "Earth Eater": (weak) => {
    weak.Ground = 0;
  },
  "Thick Fat": (weak) => {
    weak.Ice *= 0.5;
    halfDamageFromFire(weak, null as any);
  },
  Heatproof: halfDamageFromFire,
  Drizzle: halfDamageFromFire,
  "Water Bubble": (weak) => {
    halfDamageFromFire(weak, null as any);
    immunityToBurn(weak, null as any);
  },
  "Thermal Exchange": immunityToBurn,
  "Water Veil": immunityToBurn,
  Limber: (weak) => {
    weak.par = 0;
  },
  "Sweet Veil": (weak) => {
    weak.slp = 0;
  },
  "Vital Spirit": (weak) => {
    weak.slp = 0;
  },
  Insomnia: (weak) => {
    weak.slp = 0;
  },
  "Magma Armor": (weak) => {
    weak.frz = 0;
  },
  "Purifying Salt": (weak) => {
    weak.Ghost *= 0.5;
    immunityToMajorStatus(weak, null as any);
  },
  "Shields Down": immunityToMajorStatus,
  Comatose: immunityToMajorStatus,
  Immunity: immunityToPoison,
  "Pastel Veil": immunityToPoison,
  Overcoat: (weak) => {
    weak.powder = 0;
    immunityToSandstorm(weak, null as any);
    immunityToHail(weak, null as any);
  },
  "Magic Guard": (weak) => {
    immunityToSandstorm(weak, null as any);
    immunityToHail(weak, null as any);
  },
  "Sand Force": immunityToSandstorm,
  "Sand Rush": immunityToSandstorm,
  "Sand Veil": immunityToSandstorm,
  "Ice Body": immunityToHail,
  "Snow Cloak": immunityToHail,
  Drought: (weak) => {
    weak.Water *= 0.5;
  },
  "Orichalcum Pulse": (weak) => {
    weak.Water *= 0.5;
  },
  "Delta Stream": (weak, specie) => {
    if (specie.types.includes("Flying")) {
      weak.Ice *= 0.5;
      weak.Electric *= 0.5;
      weak.Rock *= 0.5;
    }
  },
  "Wonder Guard": (weak) => {
    for (const type in weak) {
      if (weak[type] <= 1) {
        weak[type] = 0;
      }
    }
  },
  Mountaineer: (weak) => {
    weak.Rock = 0;
  },
  "Prism Armor": superEffectiveResistance,
  "Solid Rock": superEffectiveResistance,
  Filter: superEffectiveResistance,
  "Primal Armor": (weak) => {
    for (const type in weak) {
      if (weak[type] > 1) {
        weak[type] /= 2;
      }
    }
  },
};
