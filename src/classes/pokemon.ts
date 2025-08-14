import { ID, Specie, toID, TypeName } from "@pkmn/data";
import {
  AbilityName,
  As,
  Condition,
  Dex,
  EggGroup,
  EvoType,
  FormeName,
  GenderName,
  Item,
  ItemName,
  Move,
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
import { getEffectivePower } from "../services/data-services/move.service";
import { typeWeak } from "../services/data-services/type.services";
import {
  CoverageMove,
  FullCoverageMove,
} from "../services/matchup-services/coverage.service";
import { getBst } from "./specieUtil";
import { PZError } from "..";

export type PokemonOptions = {
  shiny?: boolean;
  nickname?: string;
  draftFormes?: ID[];
  modifiers?: {
    abilities?: string[];
    moves?: string[];
  };
  capt?: {
    tera?: TypeName[];
    z?: TypeName[];
    dmax?: boolean;
  };
};

export type Pokemon = PokemonOptions & {
  id: ID;
  name: string;
};

export class DraftSpecie implements Specie, Pokemon {
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
  canGigantamax?: MoveName;
  gmaxUnreleased?: boolean;
  cannotDynamax?: boolean;
  forceTeraType?: string;
  shiny?: boolean;
  capt?: Partial<{ tera: TypeName[]; z: TypeName[]; dmax: boolean }>;
  ruleset: Ruleset;
  bst: number;
  inheritsFrom!: ID;
  formes?: SpeciesName[];
  evoRegion?: "Alola" | "Galar";
  dex!: Dex;
  nickname?: string;
  modifiers?: { abilities?: string[]; moves?: string[] };
  draftFormes?: ID[];

  toString: () => SpeciesName;
  toJSON: () => { [key: string]: any };
  constructor(
    pokemonData: (PokemonData | PokemonFormData) | (Specie & PokemonOptions),
    ruleset: Ruleset
  ) {
    let specie =
      pokemonData instanceof Specie
        ? pokemonData
        : ruleset.species.get(pokemonData.id);
    //Might get rid of eventually
    if (!specie)
      specie = new DraftSpecie(
        new Specie(
          ruleset.dex,
          ruleset.exists,
          ruleset.dex.species.get(pokemonData.id)
        ),
        ruleset
      );
    Object.assign(this, specie);
    this.ruleset = ruleset;
    const TYPES = Array.from(this.ruleset.types).map((type) => type.name);
    const ZTYPES = TYPES.filter((name) => name !== "Stellar");
    (this.capt = {
      tera: pokemonData.capt?.tera
        ? pokemonData.capt.tera.length >= TYPES.length
          ? []
          : pokemonData.capt.tera
        : undefined,
      z: pokemonData.capt?.z
        ? pokemonData.capt.z.length >= ZTYPES.length
          ? []
          : pokemonData.capt.z
        : undefined,
      dmax: pokemonData.capt?.dmax,
    }),
      (this.nickname = pokemonData.nickname);
    this.modifiers = {
      moves: pokemonData.modifiers?.moves,
      abilities: pokemonData.modifiers?.abilities,
    };
    this.draftFormes = pokemonData.draftFormes?.map((specie) =>
      typeof specie === "string" ? specie : specie.id
    );
    this.toString = specie.toString;
    this.toJSON = specie.toJSON;
    this.shiny = pokemonData.shiny;

    if (specie.unreleasedHidden) {
      this.abilities = {
        0: specie.abilities[0],
        1: specie.abilities[1],
        S: specie.abilities.S,
      };
    } else {
      this.abilities = specie.abilities;
    }
    this.bst = getBst(specie);
  }

  get formeNum() {
    return this.baseSpecies === this.name
      ? this.formeOrder
        ? this.formeOrder.findIndex((name) => name === this.name)
        : 0
      : this.ruleset.species
          .get(this.baseSpecies)!
          .formeOrder?.findIndex(
            (name) =>
              name ===
              (this.isNonstandard === "Gigantamax"
                ? this.baseSpecies
                : this.name)
          ) ?? 0;
  }

  toClient(): PokemonFormData {
    const TYPES = Array.from(this.ruleset.types).map((type) => type.name);
    const ZTYPES = TYPES.filter((name) => name !== "Stellar");
    const capt = {
      tera: this.capt?.tera
        ? this.capt.tera.length
          ? this.capt.tera
          : [...TYPES]
        : undefined,
      z: this.capt?.z
        ? this.capt.z.length
          ? this.capt.z
          : [...ZTYPES]
        : undefined,
      dmax: this.capt?.dmax,
    };
    return {
      id: this.id,
      name: this.name,
      nickname: this.nickname,
      shiny: this.shiny,
      draftFormes: this.draftFormes?.map((pokemon) => {
        const specie = this.ruleset.species.get(pokemon)!;
        return { id: specie.id, name: specie.name };
      }),
      modifiers: this.modifiers,
      capt: Object.values(capt).length ? capt : undefined,
    };
  }

  toData(): PokemonData {
    return {
      id: this.id,
      nickname: this.nickname,
      shiny: this.shiny,
      draftFormes: this.draftFormes,
      modifiers: this.modifiers,
      capt: this.capt,
    };
  }

  async toTeambuilder() {
    const items = (
      ((this.requiredItem ? [this.requiredItem] : this.requiredItems)
        ?.map((itemName) => this.ruleset.items.get(itemName))
        .filter((item) => item !== undefined && item.exists) as
        | Item[]
        | undefined) ?? Array.from(this.ruleset.items)
    )
      .filter((item) => {
        if (this.requiredItem && item.name === this.requiredItem) return true;
        if (item.itemUser && !item.itemUser.includes(this.name)) return false;
        return true;
      })
      .map((item) => {
        const tags: string[] = [];
        if (item.isBerry) tags.push("Berry");
        if (item.isGem) tags.push("Gem");
        if (item.isChoice) tags.push("Choice");
        if (item.isPokeball) tags.push("Ball");
        if (item.zMove) tags.push("Z");
        if (item.megaStone) tags.push("Mega");
        if (item.onPlate) tags.push("Plate");
        if (item.onDrive) tags.push("Drive");
        if (item.onMemory) tags.push("Memory");
        return {
          name: item.name,
          id: item.id,
          pngId: `https://play.pokemonshowdown.com/sprites/itemicons/${item.name
            .replace(" ", "-")
            .toLowerCase()}.png`,
          desc: item.desc,
          tags,
        };
      });

    return {
      abilities: this.getAbilities().filter(
        (ability) => ability !== ""
      ) as AbilityName[],

      items,
      learnset: (await this.learnset())
        .map((move) => ({
          id: move.id,
          name: move.name,
          type: move.type,
          category: move.category,
          effectivePower: getEffectivePower(move),
          basePower: move.basePower,
          accuracy: move.accuracy,
        }))
        .sort((x, y) => y.effectivePower - x.effectivePower),
      data: {
        ...this.toClient(),
        types: this.types,
        baseStats: this.baseStats,
      },
    };
  }

  //Type functions
  private $typechart?: {
    [key: string]: number;
  };
  typechart(): { [key: string]: number } {
    if (this.$typechart) return this.$typechart;
    const weak = typeWeak(this.types, this.ruleset);
    this.getAbilities().forEach((ability) => {
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
        case "Mountaineer": {
          weak.Rock = 0;
          break;
        }
        case "Prism Armor":
        case "Solid Rock":
        case "Filter":
          for (let type in weak) {
            if (weak[type] > 1) {
              weak[type] = weak[type] * 0.75;
            }
          }
          break;

        case "Primal Armor":
          for (let type in weak) {
            if (weak[type] > 1) {
              weak[type] = weak[type] / 2;
            }
          }
          break;
      }
    });
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

  getAbilities(): string[] {
    if (this.modifiers?.abilities?.length) return this.modifiers.abilities;
    return Object.values(this.abilities);
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
          cPower: -1,
          name: "Tera Blast",
          category: "Physical",
          type: type,
        };
        coverage.Special[type] = {
          id: "terablast" as ID,
          ePower: -1,
          cPower: -1,
          name: "Tera Blast",
          category: "Special",
          type: type,
        };
      }
    }
    for (const move of learnset) {
      if (move.category !== "Status") {
        const ePower = getEffectivePower(move);
        let type = move.type;
        if (move.id === "ivycudgel") {
          if (this.requiredItem === "Wellspring Mask") {
            type = "Water";
          } else if (this.requiredItem === "Cornerstone Mask") {
            type = "Rock";
          } else if (this.requiredItem === "Hearthflame Mask") {
            type = "Fire";
          }
        }
        if (
          !(type in coverage[move.category]) ||
          coverage[move.category][type].ePower < ePower
        ) {
          coverage[move.category][type] = {
            id: move.id,
            name: move.name,
            ePower: ePower,
            cPower:
              ePower *
              (this.types.includes(type) ? 1.5 : 1) *
              (move.category === "Special"
                ? this.baseStats.spa
                : this.baseStats.atk),
            type: type,
            stab: this.types.includes(type) || undefined,
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

  //Moveset functions
  private $fullcoverage?: {
    physical: {
      [key: string]: FullCoverageMove[];
    };
    special: {
      [key: string]: FullCoverageMove[];
    };
  };
  async fullcoverage(): Promise<{
    physical: {
      [key: string]: FullCoverageMove[];
    };
    special: {
      [key: string]: FullCoverageMove[];
    };
  }> {
    if (this.$fullcoverage) return this.$fullcoverage;
    const learnset = await this.learnset();
    if (!learnset) return { physical: {}, special: {} };
    const coverage: {
      physical: {
        [key: string]: Move[];
      };
      special: {
        [key: string]: Move[];
      };
      teraBlast?: true;
    } = { physical: {}, special: {} };
    const addMove = (
      list: { [key: string]: Move[] },
      move: Move,
      type: TypeName
    ) => {
      if (!(type in list)) list[type] = [];
      list[type].push(move);
    };

    learnset.forEach((move) => {
      if (move.category === "Status") return;
      const ePower = getEffectivePower(move);
      let type = move.type;
      if (move.id === "ivycudgel") {
        if (this.requiredItem === "Wellspring Mask") {
          type = "Water";
        } else if (this.requiredItem === "Cornerstone Mask") {
          type = "Rock";
        } else if (this.requiredItem === "Hearthflame Mask") {
          type = "Fire";
        }
      }
      const category =
        move.category === "Physical" ? coverage.physical : coverage.special;
      if (move.id === "terablast" && this.capt?.tera) {
        this.capt.tera.forEach((teratype) => {
          addMove(
            coverage.physical,
            { ...move, type: teratype, category: "Physical" },
            teratype
          );
          addMove(
            coverage.special,
            { ...move, type: teratype, category: "Special" },
            teratype
          );
        });
      }
      addMove(category, move, type);
    });
    const finalCoverage = {
      physical: Object.fromEntries(
        Object.entries(coverage.physical).map(([type, moves]) => [
          type,
          moves
            .sort((a, b) => b.basePower - a.basePower)
            .map((move) => ({
              value: 1 / moves.length,
              id: move.id,
              name: move.name,
              accuracy: move.accuracy === true ? "-" : move.accuracy.toFixed(0),
              basePower: move.basePower ? move.basePower.toFixed(0) : "-",
              desc: move.shortDesc,
              type: type,
              pp: (move.pp * 8) / 5,
              category: move.category,
            })),
        ])
      ),
      special: Object.fromEntries(
        Object.entries(coverage.special).map(([type, moves]) => [
          type,
          moves
            .sort((a, b) => b.basePower - a.basePower)
            .map((move) => ({
              value: 1 / moves.length,
              id: move.id,
              name: move.name,
              accuracy: move.accuracy === true ? "-" : move.accuracy.toFixed(0),
              basePower: move.basePower ? move.basePower.toFixed(0) : "-",
              desc: move.shortDesc,
              type: type,
              pp: (move.pp * 8) / 5,
              category: move.category,
            })),
        ])
      ),
    };
    this.$fullcoverage = finalCoverage;
    return finalCoverage;
  }

  async bestCoverage(oppTeam: DraftSpecie[]) {
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

  private $learnset?: Promise<Move[]>;
  async learnset(): Promise<Move[]> {
    if (this.$learnset) return this.$learnset;
    this.$learnset = (async () => {
      const learnset = await this.ruleset.learnsets.learnable(
        this.id,
        this.ruleset.restriction
      );
      if (!learnset) return [];
      const moves: Move[] = Object.keys(learnset)
        .map((move) => this.ruleset.moves.get(move))
        .filter((move) => move !== undefined) as Move[];
      return moves;
    })();
    return this.$learnset;
  }

  async canLearn(moveString: string): Promise<boolean> {
    if (this.id === "smeargle") return true;
    let moveID = toID(moveString);
    return (await this.learnset()).some((move) => move.id === moveID);
  }
}

export type PokemonFormData = {
  id: ID;
  name: string;
  shiny?: boolean;
  nickname?: string;
  draftFormes?: Pokemon[];
  modifiers?: {
    abilities?: string[];
    moves?: string[];
  };
  capt?: {
    tera?: TypeName[];
    z?: TypeName[];
    dmax?: boolean;
  };
};
