import {
  AbilityName,
  Generations,
  ID,
  Specie,
  SpeciesName,
  StatsTable,
  TypeName,
  toID,
} from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { DraftSpecies } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";
import { getLearnset } from "./learnset.service";
import { getCategory, getEffectivePower, getType } from "./move.service";
import { newtypeWeak, typeWeak } from "./type.services";

export function getName(ruleset: Ruleset, pokemonID: ID): SpeciesName {
  return ruleset.gen.dex.species.getByID(pokemonID).name;
}

export function getBaseStats(ruleset: Ruleset, pokemonID: ID): StatsTable {
  return ruleset.gen.dex.species.getByID(pokemonID).baseStats;
}

export function getWeak(
  ruleset: Ruleset,
  pokemon: DraftSpecies
): { [key: string]: number } {
  let weak = typeWeak(ruleset, pokemon.types);
  for (let ability of Object.values(pokemon.abilities)) {
    ability = ability as AbilityName;
    switch (ability) {
      case "Fluffy":
        weak.Fire *= 2;
        break;
      case "Dry Skin":
        weak.Fire *= 1.25;
      case "Water Absorb":
      case "Desolate Land":
      case "Storm Drain":
        weak.Water = 0;
        break;
      case "Volt Absorb":
      case "Lightning Rod":
      case "Motor Drive":
        weak.Electric = 0;
        break;
      case "Flash Fire":
      case "Primordial Sea":
      case "Well-Baked Body":
        weak.Fire = 0;
        break;
      case "Sap Sipper":
        weak.Grass = 0;
        break;
      case "Levitate":
      case "Earth Eater":
        weak.Ground = 0;
        break;
      case "Thick Fat":
        weak.Ice *= 0.5;
      case "Heatproof":
      case "Drizzle":
        weak.Fire *= 0.5;
        break;
      case "Water Bubble":
        weak.Fire *= 0.5;
      case "Thermal Exchange":
      case "Water Veil":
        weak.brn = 0;
        break;
      case "Limber":
        weak.par = 0;
        break;
      case "Sweet Veil":
      case "Vital Spirit":
      case "Insomnia":
        weak.slp = 0;
        break;
      case "Magma Armor":
        weak.frz = 0;
        break;
      case "Purifying Salt":
        weak.Ghost *= 0.5;
      case "Shields Down":
      case "Comatose":
        weak.brn = 0;
        weak.par = 0;
        weak.frz = 0;
        weak.slp = 0;
      case "Immunity":
      case "Pastel Veil":
        weak.psn = 0;
        weak.tox = 0;
        break;
      case "Overcoat":
        weak.powder = 0;
      case "Magic Guard":
        weak.hail = 0;
      case "Sand Force":
      case "Sand Rush":
      case "Sand Veil":
        weak.sandstorm = 0;
        break;
      case "Ice Body":
      case "Snow Cloak":
        weak.hail = 0;
        break;
      case "Drought":
      case "Orichalcum Pulse":
        weak.Water *= 0.5;
        break;
      case "Delta Stream":
        if (pokemon.types.includes("Flying")) {
          weak.Ice *= 0.5;
          weak.Electric *= 0.5;
          weak.Rock *= 0.5;
        }
        break;
      case "Wonder Guard":
        for (let type in weak) {
          if (weak[type] <= 1) {
            weak[type] = 0;
          }
        }
        break;
    }
  }
  return weak;
}

export function newgetTypechart(mon: Specie): { [key: string]: number } {
  let types = mon.types;
  let weak = newtypeWeak(mon);
  for (let ability of Object.values(mon.abilities)) {
    ability = ability as AbilityName;
    switch (ability) {
      case "Fluffy":
        weak.Fire *= 2;
        break;
      case "Dry Skin":
        weak.Fire *= 1.25;
      case "Water Absorb":
      case "Desolate Land":
      case "Storm Drain":
        weak.Water = 0;
        break;
      case "Volt Absorb":
      case "Lightning Rod":
      case "Motor Drive":
        weak.Electric = 0;
        break;
      case "Flash Fire":
      case "Primordial Sea":
      case "Well-Baked Body":
        weak.Fire = 0;
        break;
      case "Sap Sipper":
        weak.Grass = 0;
        break;
      case "Levitate":
      case "Earth Eater":
        weak.Ground = 0;
        break;
      case "Thick Fat":
        weak.Ice *= 0.5;
      case "Heatproof":
      case "Drizzle":
        weak.Fire *= 0.5;
        break;
      case "Water Bubble":
        weak.Fire *= 0.5;
      case "Thermal Exchange":
      case "Water Veil":
        weak.brn = 0;
        break;
      case "Limber":
        weak.par = 0;
        break;
      case "Sweet Veil":
      case "Vital Spirit":
      case "Insomnia":
        weak.slp = 0;
        break;
      case "Magma Armor":
        weak.frz = 0;
        break;
      case "Purifying Salt":
        weak.Ghost *= 0.5;
      case "Shields Down":
      case "Comatose":
        weak.brn = 0;
        weak.par = 0;
        weak.frz = 0;
        weak.slp = 0;
      case "Immunity":
      case "Pastel Veil":
        weak.psn = 0;
        weak.tox = 0;
        break;
      case "Overcoat":
        weak.powder = 0;
      case "Magic Guard":
        weak.hail = 0;
      case "Sand Force":
      case "Sand Rush":
      case "Sand Veil":
        weak.sandstorm = 0;
        break;
      case "Ice Body":
      case "Snow Cloak":
        weak.hail = 0;
        break;
      case "Drought":
      case "Orichalcum Pulse":
        weak.Water *= 0.5;
        break;
      case "Delta Stream":
        if (types.includes("Flying")) {
          weak.Ice *= 0.5;
          weak.Electric *= 0.5;
          weak.Rock *= 0.5;
        }
        break;
      case "Wonder Guard":
        for (let type in weak) {
          if (weak[type] <= 1) {
            weak[type] = 0;
          }
        }
        break;
    }
  }
  return weak;
}

export function newgetWeak(mon: Specie) {
  let tc = newgetTypechart(mon);
  return Object.entries(tc)
    .filter((value: [string, number]) => value[1] > 1)
    .map((value: [string, number]) => value[0]);
}

export function newgetResists(mon: Specie) {
  let tc = newgetTypechart(mon);
  return Object.entries(tc)
    .filter((value: [string, number]) => value[1] < 1)
    .map((value: [string, number]) => value[0]);
}

export function newgetImmune(mon: Specie) {
  let tc = newgetTypechart(mon);
  return Object.entries(tc)
    .filter((value: [string, number]) => value[1] === 0)
    .map((value: [string, number]) => value[0]);
}

export function learns(pokemon: DraftSpecies, moveID: string): boolean {
  let learns = false;
  getLearnset(pokemon, {
    gen: new Generations(Dex).get(9),
    natdex: true,
  }).then((learnset) => {
    learns = Object.keys(learnset).includes(moveID);
  });

  return learns;
}

export async function getCoverage(ruleset: Ruleset, pokemon: DraftSpecies) {
  let learnset = await getLearnset(pokemon, ruleset);
  let monTypes = pokemon.types;
  let coverage: {
    Physical: {
      [key: string]: {
        ePower: number;
        id: ID;
        type: string;
        stab: boolean;
      };
    };
    Special: {
      [key: string]: {
        ePower: number;
        id: ID;
        type: string;
        stab: boolean;
      };
    };
    teraBlast?: true;
  } = { Physical: {}, Special: {} };
  if (learnset.terablast && pokemon.capt?.tera) {
    for (const type of pokemon.capt.tera) {
      coverage.Physical[type] = {
        id: "terablast" as ID,
        ePower: -1,
        type: type,
        stab: monTypes.includes(type as TypeName),
      };
      coverage.Special[type] = {
        id: "terablast" as ID,
        ePower: -1,
        type: type,
        stab: monTypes.includes(type as TypeName),
      };
    }
  }
  for (const move in learnset) {
    let moveID = toID(move);
    const category = getCategory(ruleset, moveID);
    let type = getType(ruleset, moveID, monTypes);
    if (category !== "Status") {
      const ePower = getEffectivePower(ruleset, moveID);
      if (
        !(type in coverage[category]) ||
        coverage[category][type].ePower < ePower
      ) {
        coverage[category][type] = {
          id: moveID,
          ePower: ePower,
          type: type,
          stab: monTypes.includes(type as TypeName),
        };
      }
    }
    ``;
  }
  return {
    physical: Object.values(coverage.Physical),
    special: Object.values(coverage.Special),
  };
}

export function getSpecies(ruleset: Ruleset) {
  return Object.fromEntries(
    Object.entries(ruleset.gen.dex.data.Species).map(([key, specie]) => {
      let psname = specie.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (specie.baseSpecies && specie.forme) {
        psname =
          specie.baseSpecies.toLowerCase().replace(/[\s-.]+/g, "") +
          "-" +
          specie.forme.toLowerCase().replace(/[\s-.%]+/g, "");
      }
      let pdname = specie.name
        .toLowerCase()
        .replace(/[ ]/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      if (specie.forme) {
        pdname = pdname
          .replace("paldea", "paldean")
          .replace("alola", "alolan")
          .replace("galar", "galarian")
          .replace("hisui", "hisuian");
      }
      return [
        key,
        {
          name: specie.name,
          ps: psname,
          serebii: specie.num.toString().padStart(3, "0"),
          pd: pdname,
        },
      ];
    })
  );
}

export function filterNames(ruleset: Ruleset, query: string) {
  if (query === "") {
    return [];
  }
  const nonstandardInfo = ruleset.natdex
    ? Object.fromEntries(
        Object.entries(ruleset.gen.dex.species).map(([key, specie]) => [
          key,
          specie.isNonstandard,
        ])
      )
    : {};
  return Object.entries(ruleset.gen.dex.data.Species)
    .filter(([key, specie]) => {
      const isNonstandard = nonstandardInfo[key] || null;
      return (
        specie.name.toLowerCase().startsWith(query.toLowerCase()) &&
        (!isNonstandard || (ruleset.natdex && isNonstandard == "Past"))
      );
    })
    .map(([key, specie]) => ({ pid: key, name: specie.name }));
}

export function needsItem(ruleset: Ruleset, pokemonID: ID) {
  return ruleset.gen.dex.species.getByID(pokemonID).requiredItem;
}
