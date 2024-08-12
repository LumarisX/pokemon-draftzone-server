import { DraftSpecie } from "../../classes/pokemon";
import { typeWeak } from "./type.services";

export function getTypechart(mon: DraftSpecie): { [key: string]: number } {
  let types = mon.types;
  let weak = typeWeak(mon);
  for (let ability of Object.values(mon.abilities)) {
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

export function getWeak(mon: DraftSpecie) {
  let tc = getTypechart(mon);
  return Object.entries(tc)
    .filter((value: [string, number]) => value[1] > 1)
    .map((value: [string, number]) => value[0]);
}

export function getResists(mon: DraftSpecie) {
  let tc = getTypechart(mon);
  return Object.entries(tc)
    .filter((value: [string, number]) => value[1] < 1)
    .map((value: [string, number]) => value[0]);
}

export function getImmune(mon: DraftSpecie) {
  let tc = getTypechart(mon);
  return Object.entries(tc)
    .filter((value: [string, number]) => value[1] === 0)
    .map((value: [string, number]) => value[0]);
}

// //comepletely wrong. Should be using Array.from(gen.dex.species)
// getSpecies() {
//   return Object.fromEntries(
//     Object.entries(ruleset.gen.dex.data.Species).map(([key, DraftSpecie]) => {
//       let psname = DraftSpecie.name.toLowerCase().replace(/[^a-z0-9]/g, "");
//       if (DraftSpecie.baseSpecies && DraftSpecie.forme) {
//         psname =
//           DraftSpecie.baseSpecies.toLowerCase().replace(/[\s-.]+/g, "") +
//           "-" +
//           DraftSpecie.forme.toLowerCase().replace(/[\s-.%]+/g, "");
//       }
//       let pdname = DraftSpecie.name
//         .toLowerCase()
//         .replace(/[ ]/g, "-")
//         .replace(/[^a-z0-9-]/g, "");
//       if (DraftSpecie.forme) {
//         pdname = pdname
//           .replace("paldea", "paldean")
//           .replace("alola", "alolan")
//           .replace("galar", "galarian")
//           .replace("hisui", "hisuian");
//       }
//       return [
//         key,
//         {
//           name: DraftSpecie.name,
//           ps: psname,
//           serebii: DraftSpecie.num.toString().padStart(3, "0"),
//           pd: pdname,
//         },
//       ];
//     })
//   );
// }

// filterNames(query: string) {
//   if (query === "") {
//     return [];
//   }
//   const nonstandardInfo = this.ruleset.natdex
//     ? Object.fromEntries(
//         Object.entries(ruleset.gen.dex.species).map(([key, DraftSpecie]) => [
//           key,
//           DraftSpecie.isNonstandard,
//         ])
//       )
//     : {};
//   return Object.entries(ruleset.gen.dex.data.Species)
//     .filter(([key, DraftSpecie]) => {
//       const isNonstandard = nonstandardInfo[key] || null;
//       return (
//         DraftSpecie.name.toLowerCase().startsWith(query.toLowerCase()) &&
//         (!isNonstandard || (ruleset.natdex && isNonstandard == "Past"))
//       );
//     })
//     .map(([key, DraftSpecie]) => ({ pid: key, name: DraftSpecie.name }));
// }

// needsItem(pokemonID: ID) {
//   return this.ruleset.gen.dex.species.getByID(pokemonID).requiredItem;
// }
