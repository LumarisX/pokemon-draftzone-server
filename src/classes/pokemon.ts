import { ID, Specie, toID, TypeName } from "@pkmn/data";
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
  Learnset,
  Move,
  MoveName,
  Nonstandard,
  Species,
  SpeciesAbility,
  SpeciesName,
  SpeciesTag,
  StatsTable,
  Tier,
} from "@pkmn/dex-types";
import { Ruleset } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";
import { getEffectivePower } from "../services/data-services/move.service";
import { typeWeak } from "../services/data-services/type.services";

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

  toPokemon(): Pokemon {
    return {
      id: this.id,
      name: this.name,
      shiny: this.shiny,
      capt: this.capt,
    };
  }

  //Type functions
  private $typechart:
    | {
        [key: string]: number;
      }
    | undefined;
  typechart(): { [key: string]: number } {
    if (this.$typechart) return this.$typechart;
    let weak = typeWeak(this);
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
    this.$typechart = weak;
    return weak;
  }

  getWeak() {
    let tc = this.typechart();
    return Object.entries(tc)
      .filter((value: [string, number]) => value[1] > 1)
      .map((value: [string, number]) => value[0]);
  }

  getResists() {
    let tc = this.typechart();
    return Object.entries(tc)
      .filter((value: [string, number]) => value[1] < 1)
      .map((value: [string, number]) => value[0]);
  }

  getImmune() {
    let tc = this.typechart();
    return Object.entries(tc)
      .filter((value: [string, number]) => value[1] === 0)
      .map((value: [string, number]) => value[0]);
  }

  //Moveset functions
  async coverage() {
    const coverage: {
      Physical: {
        [key: string]: {
          ePower: number;
          id: ID;
          type: string;
          stab?: true;
        };
      };
      Special: {
        [key: string]: {
          ePower: number;
          id: ID;
          type: string;
          stab?: true;
        };
      };
      teraBlast?: true;
    } = { Physical: {}, Special: {} };
    const learnset = await this.learnset();
    if (!learnset)
      return {
        physical: Object.values(coverage.Physical),
        special: Object.values(coverage.Special),
      };
    if (learnset.some((move) => move.id === "terablast") && this.capt?.tera) {
      for (const type of this.capt.tera) {
        coverage.Physical[type] = {
          id: "terablast" as ID,
          ePower: -1,
          type: type,
        };
        coverage.Special[type] = {
          id: "terablast" as ID,
          ePower: -1,
          type: type,
        };
      }
    }
    for (const move of learnset) {
      if (move.category !== "Status") {
        const ePower = getEffectivePower(move);
        if (
          !(move.type in coverage[move.category]) ||
          coverage[move.category][move.type].ePower < ePower
        ) {
          coverage[move.category][move.type] = {
            id: move.id,
            ePower: ePower,
            type: move.type,
            stab: this.types.includes(move.type) || undefined,
          };
        }
      }
    }
    return {
      physical: Object.values(coverage.Physical),
      special: Object.values(coverage.Special),
    };
  }

  async bestCoverage() {
    let coverage = await this.coverage();
    coverage.physical = coverage.physical.map((move) => ({
      ...move,
      recommended: move.stab,
    }));
    coverage.special = coverage.special.map((move) => ({
      ...move,
      recommended: move.stab,
    }));
    return coverage;
  }

  private $learnset: Move[] | undefined;
  async learnset(): Promise<Move[]> {
    if (this.$learnset) return this.$learnset;
    let id = this.id;
    let learnset = await this.ruleset.gen.learnsets.get(id);
    if (!learnset) {
      id =
        typeof this.battleOnly === "string" &&
        this.battleOnly !== this.baseSpecies
          ? toID(this.battleOnly)
          : toID(this.baseSpecies);
      learnset = await this.ruleset.gen.learnsets.get(id);
    }
    let species: Species = this;
    let totalLearnset: Learnset | undefined;
    while (learnset) {
      if (totalLearnset && totalLearnset.learnset) {
        for (let move in learnset.learnset) {
          if (move in totalLearnset.learnset) {
            totalLearnset.learnset[move].concat(learnset.learnset[move]);
          } else {
            totalLearnset.learnset[move] = learnset.learnset[move];
          }
        }
      } else {
        totalLearnset = learnset;
      }
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
    if (!learnset?.learnset) return [];
    let moves: Move[] = Object.keys(learnset.learnset)
      .map((move) => this.ruleset.gen.moves.get(move))
      .filter((move) => move !== undefined);
    this.$learnset = moves as Move[];
    return moves;
  }

  async learns(moveID: ID): Promise<boolean> {
    let learns = false;
    let learnset = await this.learnset();
    if (!learnset) return false;
    learns = Object.keys(learnset).includes(moveID);
    return learns;
  }
}

export type PokemonFormData = {
  id: ID;
  shiny: boolean | null;
  capt: {
    tera?: { [key: string]: boolean };
    z?: boolean;
    teraCheck: boolean;
  } | null;
  captCheck: boolean | null;
};

export class PokemonBuilder {
  data: PokemonData;
  error: string | undefined;

  constructor(ruleset: Ruleset, pokemonData: PokemonFormData) {
    this.data = {
      id: toID(pokemonData.id),
      shiny: pokemonData.shiny || undefined,
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
