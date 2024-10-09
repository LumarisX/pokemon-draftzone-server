import { ID, MoveSource, toID, TypeName } from "@pkmn/data";
import {
  AbilityName,
  As,
  Condition,
  EggGroup,
  EvoType,
  FormeName,
  GenderName,
  ItemName,
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
import { CoverageMove } from "../services/matchup-services/coverage.service";

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

export class DraftSpecies implements Species, Pokemon {
  effectType!: "Pokemon";
  kind!: "Species";
  baseSpecies!: SpeciesName;
  baseForme!: "" | FormeName;
  canHatch!: boolean;
  forme!: "" | FormeName;
  abilities!: SpeciesAbility<"" | AbilityName>;
  types!: [TypeName] | [TypeName, TypeName];
  prevo?: "" | SpeciesName;
  evos?: SpeciesName[];
  nfe!: boolean;
  evoMove?: MoveName;
  cosmeticFormes?: SpeciesName[];
  otherFormes?: SpeciesName[];
  formeOrder?: SpeciesName[];
  genderRatio!: { M: number; F: number };
  weighthg!: number;
  tags!: SpeciesTag[];
  unreleasedHidden!: boolean | "Past";
  maleOnlyHidden!: boolean;
  changesFrom?: SpeciesName;
  tier!: Tier.Singles | Tier.Other;
  natDexTier!: Tier.Singles | Tier.Other;
  doublesTier!: "Illegal" | Tier.Doubles;
  isMega?: boolean;
  isPrimal?: boolean;
  battleOnly?: SpeciesName | SpeciesName[];
  isGigantamax?: MoveName;
  requiredAbility?: AbilityName;
  requiredItem?: ItemName;
  requiredItems?: ItemName[];
  requiredMove?: MoveName;
  id!: ID;
  name!: string & As<"SpeciesName">;
  fullname!: string;
  exists!: boolean;
  num!: number;
  gen!: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  shortDesc!: string;
  desc!: string;
  isNonstandard!: Nonstandard | null;
  duration?: number;
  inherit?: boolean;
  baseStats!: StatsTable;
  eggGroups!: EggGroup[];
  weightkg!: number;
  condition?: Partial<Condition>;
  evoLevel?: number;
  evoCondition?: string;
  evoItem?: string;
  evoType?: EvoType;
  gender?: GenderName;
  maxHP?: number;
  canGigantamax?: string;
  gmaxUnreleased?: boolean;
  cannotDynamax?: boolean;
  forceTeraType?: string;
  shiny?: boolean;
  capt?: { tera?: TypeName[]; z?: boolean };
  ruleset: Ruleset;
  bst: number;

  constructor(species: Species, data: PokemonOptions, ruleset: Ruleset) {
    Object.assign(this, species);
    this.shiny = data.shiny;
    this.capt = data.capt;
    this.ruleset = ruleset;
    this.bst = Object.values(species.baseStats).reduce(
      (sum, stat) => stat + sum
    );
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
    let weak = typeWeak(this.types, this.ruleset);
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
  private $coverage?: {
    physical: CoverageMove[];
    special: CoverageMove[];
  };
  async coverage() {
    if (this.$coverage) return this.$coverage;
    const coverage: {
      Physical: {
        [key: string]: CoverageMove;
      };
      Special: {
        [key: string]: CoverageMove;
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
        if (type === "Stellar") continue;
        coverage.Physical[type] = {
          id: "terablast" as ID,
          ePower: -1,
          name: "Tera Blast",
          category: "Physical",
          type: type,
        };
        coverage.Special[type] = {
          id: "terablast" as ID,
          ePower: -1,
          name: "Tera Blast",
          category: "Special",
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
            name: move.name,
            ePower: ePower,
            type: move.type,
            stab: this.types.includes(move.type) || undefined,
            category: move.category,
          };
        }
      }
    }
    const finalCoverage = {
      physical: Object.values(coverage.Physical),
      special: Object.values(coverage.Special),
    };
    this.$coverage = finalCoverage;
    return finalCoverage;
  }

  async bestCoverage(oppTeam: DraftSpecies[]) {
    const coverage = await this.coverage();
    const allMoves = [...coverage.physical, ...coverage.special];
    const best: { moves: CoverageMove[]; maxEffectiveness: number } = {
      moves: [],
      maxEffectiveness: 0,
    };
    const findBestCombination = (start: number, chosen: CoverageMove[]) => {
      if (chosen.length === 4) {
        const effectiveness = oppTeam.reduce((total, oppPokemon) => {
          const typeEffectiveness = oppPokemon.typechart();
          const maxEffectiveness = chosen.reduce((max, move) => {
            const stat =
              move.category === "Physical"
                ? this.baseStats.atk
                : this.baseStats.spa;
            let value =
              move.ePower * (typeEffectiveness[move.type] || 1) * stat;
            if (move.stab) value *= 1.5;
            return Math.max(max, value);
          }, 0);
          return total + maxEffectiveness;
        }, 0);
        if (effectiveness > best.maxEffectiveness) {
          best.maxEffectiveness = effectiveness;
          best.moves = [...chosen];
        }
        return;
      }
      for (let i = start; i < allMoves.length; i++) {
        chosen.push(allMoves[i]);
        findBestCombination(i + 1, chosen);
        chosen.pop();
      }
    };
    findBestCombination(0, []);
    best.moves.forEach((move) => (move.recommended = true));
    return coverage;
  }

  private $learnset?: Move[];
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
    let totalLearnset: { [moveid: string]: MoveSource[] } = {};
    while (learnset) {
      for (let move in learnset.learnset) {
        // will need to be updated for gen 10
        if (
          (this.ruleset.natdex &&
            learnset.learnset[move].some(
              (learns) => +learns.charAt(0) <= this.ruleset.gen.num
            )) ||
          (!this.ruleset.natdex &&
            learnset.learnset[move].some((learns) => {
              return +learns.charAt(0) === this.ruleset.gen.num;
            }))
        )
          if (move in totalLearnset) {
            totalLearnset[move].concat(learnset.learnset[move]);
          } else {
            totalLearnset[move] = learnset.learnset[move];
          }
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

    if (!totalLearnset) return [];
    let moves: Move[] = Object.keys(totalLearnset)
      .map((move) => this.ruleset.gen.moves.get(move))
      .filter((move) => move !== undefined) as Move[];
    this.$learnset = moves;
    return moves;
  }

  async learns(moveString: string): Promise<boolean> {
    if (this.id === "smeargle") return true;
    let moveID = toID(moveString);
    return (await this.learnset()).some((move) => move.id === moveID);
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
        z: pokemonData.capt!.z ? true : undefined,
        tera: pokemonData.capt?.teraCheck
          ? (Object.keys(pokemonData.capt?.tera || {}).filter(
              (type) => pokemonData.capt!.tera![type]
            ) as TypeName[])
          : undefined,
      };
    }
  }
}
