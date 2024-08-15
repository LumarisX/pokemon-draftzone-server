import { ID, Specie, toID, Type, TypeName } from "@pkmn/data";
import { Species } from "@pkmn/dex-types";
import {
  AbilityName,
  Condition,
  Dex,
  EggGroup,
  EvoType,
  FormeName,
  GenderName,
  GenerationNum,
  ItemName,
  MoveName,
  Nonstandard,
  SpeciesAbility,
  SpeciesName,
  SpeciesTag,
  StatsTable,
  Tier,
} from "@pkmn/dex-types";
import { Ruleset } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";
import { getName } from "../services/data-services/pokedex.service";
import {
  getCategory,
  getEffectivePower,
  getType,
} from "../services/data-services/move.service";

export interface PokemonOptions {
  shiny?: boolean;
  capt?: {
    tera?: TypeName[];
    z?: boolean;
  };
}

export interface Pokemon extends PokemonOptions {
  id: ID;
  name: string;
}

export type PokemonFormData = {
  id: ID;
  shiny?: boolean;
  name?: string;
  capt?: {
    tera?: { [key: string]: boolean };
    z?: boolean;
    teraCheck: boolean;
  };
  captCheck?: boolean;
};

export class DraftSpecies implements Specie, Pokemon {
  id!: ID;
  name!: SpeciesName;
  fullname!: string;
  exists!: boolean;
  num!: number;
  gen!: GenerationNum;
  shortDesc!: string;
  desc!: string;
  isNonstandard!: Nonstandard | null;
  duration?: number | undefined;
  effectType!: "Pokemon";
  kind!: "Species";
  baseStats!: StatsTable;
  baseSpecies!: SpeciesName;
  baseForme!: "" | FormeName;
  forme!: "" | FormeName;
  abilities!: SpeciesAbility<"" | AbilityName>;
  types!: [TypeName] | [TypeName, TypeName];
  prevo?: "" | SpeciesName | undefined;
  evos?: SpeciesName[] | undefined;
  nfe!: boolean;
  eggGroups!: EggGroup[];
  weightkg!: number;
  weighthg!: number;
  tags!: SpeciesTag[];
  unreleasedHidden!: boolean | "Past";
  maleOnlyHidden!: boolean;
  inheritsFrom!: ID;
  tier!: Tier.Singles | Tier.Other;
  doublesTier!: Tier.Doubles;
  changesFrom?: SpeciesName | undefined;
  cosmeticFormes?: SpeciesName[] | undefined;
  otherFormes?: SpeciesName[] | undefined;
  formeOrder?: SpeciesName[] | undefined;
  formes?: SpeciesName[] | undefined;
  genderRatio!: { M: number; F: number };
  isMega?: boolean | undefined;
  isPrimal?: boolean | undefined;
  battleOnly?: SpeciesName | SpeciesName[] | undefined;
  canGigantamax?: MoveName | undefined;
  gmaxUnreleased?: boolean | undefined;
  cannotDynamax?: boolean | undefined;
  requiredAbility?: AbilityName | undefined;
  requiredItem?: ItemName | undefined;
  requiredItems?: ItemName[] | undefined;
  requiredMove?: MoveName | undefined;
  gender?: GenderName | undefined;
  maxHP?: number | undefined;
  evoMove?: MoveName | undefined;
  evoItem?: string | undefined;
  evoRegion?: "Alola" | "Galar" | undefined;
  evoLevel?: number | undefined;
  evoCondition?: string | undefined;
  evoType?: EvoType | undefined;
  condition?: Partial<Condition> | undefined;
  canHatch!: boolean;
  dex!: Dex;
  shiny?: boolean | undefined;
  capt?: { tera?: TypeName[]; z?: boolean } | undefined;
  ruleset: Ruleset;
  get formeNum(): number {
    throw new Error("Method not implemented.");
  }
  toString!: () => SpeciesName;
  toJSON!: () => { [key: string]: any };

  constructor(species: Specie, data: PokemonOptions, ruleset: Ruleset) {
    Object.assign(this, species);
    this.toString = species.toString;
    this.toJSON = species.toJSON;
    this.shiny = data.shiny;
    this.capt = data.capt;
    this.ruleset = ruleset;
  }

  toPokemonData(): PokemonData {
    return {
      id: this.id,
      name: this.name,
      shiny: this.shiny,
      capt: this.capt,
    };
  }

  //Type functions

  typeWeak() {
    const conversion = [1, 2, 0.5, 0];
    let adjustedDamage: { [key: string]: number } = {};
    this.types.forEach((type) => {
      const damageTaken = this.ruleset.gen.dex.types.get(type).damageTaken;
      Object.keys(damageTaken).forEach((key) => {
        adjustedDamage[key] = adjustedDamage.hasOwnProperty(key)
          ? adjustedDamage[key] * conversion[damageTaken[key]]
          : conversion[damageTaken[key]];
      });
    });

    return adjustedDamage;
  }

  getTypeChart(): { [key: string]: number } {
    let weak = this.typeWeak();
    for (let ability of Object.values(this.abilities)) {
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
          if (this.types.includes("Flying")) {
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

  //Moveset functions

  async coverage() {
    let learnset = await this.learnset();
    let monTypes = this.types;
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
    if (learnset.terablast && this.capt?.tera) {
      for (const type of this.capt.tera) {
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
      const category = getCategory(this.ruleset, moveID);
      let type = getType(this.ruleset, moveID, monTypes);
      if (category !== "Status") {
        const ePower = getEffectivePower(this.ruleset, moveID);
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

  async learnset(): Promise<{ [moveid: string]: string[] }> {
    let restriction = undefined;
    const moves: { [key in ID]?: any } = {};
    for await (const learnset of this.all(this)) {
      for (const moveid in learnset.learnset) {
        const move = this.ruleset.gen.dex.moves.get(moveid);
        if (move) {
          const sources = learnset.learnset[moveid];
          if (
            this.ruleset.gen.learnsets.isLegal(
              move,
              sources,
              restriction || this.ruleset.gen
            )
          ) {
            let filtered = null;
            if (this.ruleset.natdex) {
              filtered = sources.filter(
                (s) => +s.charAt(0) <= this.ruleset.gen.num
              );
            } else {
              filtered = sources.filter(
                (s) => +s.charAt(0) == this.ruleset.gen.num
              );
            }
            if (!filtered.length) continue;
            if (moves[move.id]) {
              const unique = [];
              loop: for (const source of filtered) {
                const prefix = source.slice(0, 2);
                for (const s of moves[move.id])
                  if (s.startsWith(prefix)) continue loop;
                unique.push(source);
              }
              moves[move.id].push(...unique);
            } else {
              moves[move.id] = filtered;
            }
          }
        }
      }
    }
    return moves;
  }

  private async *all(species: Species) {
    let id = species.id;
    let learnset = await this.ruleset.gen.learnsets.get(id);
    if (!learnset) {
      id =
        typeof species.battleOnly === "string" &&
        species.battleOnly !== species.baseSpecies
          ? toID(species.battleOnly)
          : toID(species.baseSpecies);
      learnset = await this.ruleset.gen.learnsets.get(id);
    }
    while (learnset) {
      yield learnset;
      if (
        id === "lycanrocdusk" ||
        (species.id === "rockruff" && id === "rockruff")
      ) {
        id = "rockruffdusk" as ID;
      } else if (species.id === ("gastrodoneast" as ID)) {
        id = "gastrodon" as ID;
      } else if (species.id === ("pumpkaboosuper" as ID)) {
        id = "pumpkaboo" as ID;
      } else {
        id = toID(species.battleOnly || species.changesFrom || species.prevo);
      }
      if (!id) break;
      const s = this.ruleset.gen.dex.species.get(id);
      if (!s) break;
      species = s;
      learnset = await this.ruleset.gen.learnsets.get(id);
    }
  }
}

export class PokemonBuilder {
  data: Pokemon;
  error: string | undefined;

  constructor(ruleset: Ruleset, pokemonData: PokemonFormData) {
    this.data = {
      id: toID(pokemonData.id),
      name: getName(ruleset, pokemonData.id),
      shiny: pokemonData.shiny,
    };

    // if (!inDex(pokemonData.id)) {
    //   this.error = `${this.data.name} not found in the pokedex`;
    //   return;
    // }

    const { captCheck } = pokemonData;
    if (captCheck) {
      this.data.capt = {
        z: pokemonData.capt?.z ? true : undefined,
        tera: pokemonData.capt?.teraCheck
          ? (Object.keys(pokemonData.capt?.tera || {}).filter(
              (type) => pokemonData.capt!.tera![type]
            ) as TypeName[])
          : undefined,
      };
    }
  }
}
