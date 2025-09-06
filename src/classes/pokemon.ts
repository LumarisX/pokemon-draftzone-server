import { ID, Specie, toID, TypeName } from "@pkmn/data";
import { LRUCache } from "lru-cache";
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
import {
  CoverageMove,
  FullCoverageMove,
} from "../services/matchup-services/coverage.service";
import { PokemonData } from "../models/pokemon.schema";
import { getEffectivePower } from "../services/data-services/move.service";
import { typeWeak } from "../services/data-services/type.services";
import { getBst } from "./specieUtil";
import { abilityModifiers } from "../data/pokedex/abilities";
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

type RawCoverage = {
  Physical: {
    [key: string]: CoverageMove;
  };
  Special: {
    [key: string]: CoverageMove;
  };
};

const learnsetCache = new LRUCache<string, Promise<Move[]>>({ max: 500 });
const coverageCache = new LRUCache<string, Coverage>({ max: 500 });
const fullCoverageCache = new LRUCache<string, FullCoverage>({ max: 500 });

type Coverage = {
  physical: CoverageMove[];
  special: CoverageMove[];
};

type FullCoverage = {
  physical: { [key: string]: FullCoverageMove[] };
  special: { [key: string]: FullCoverageMove[] };
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
    this.capt = {
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
    };
    this.nickname = pokemonData.nickname;
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
    this.getAbilities().forEach((abilityName) => {
      const modifier = abilityModifiers[abilityName as AbilityName];
      if (modifier) {
        modifier(weak, this);
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
  async coverage(): Promise<Coverage> {
    const cacheKey = `${this.ruleset.name}:${this.id}`;
    const cached = coverageCache.get(cacheKey);
    let baseCoverage: Coverage;

    if (cached) {
      baseCoverage = cached;
    } else {
      const coverage: RawCoverage = { Physical: {}, Special: {} };
      const learnset = await this.learnset();

      if (learnset) {
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
      }
      baseCoverage = {
        physical: Object.values(coverage.Physical),
        special: Object.values(coverage.Special),
      };
      coverageCache.set(cacheKey, baseCoverage);
    }
    const learnset = await this.learnset();
    if (
      !this.capt?.tera ||
      this.capt.tera.length === 0 ||
      !learnset.some((move) => move.id === "terablast")
    ) {
      return baseCoverage;
    }

    const finalCoverage: Coverage = JSON.parse(JSON.stringify(baseCoverage));

    if (learnset.some((move) => move.id === "terablast")) {
      for (const type of this.capt.tera) {
        if (type === "Stellar") continue;
        if (finalCoverage.physical.every((move) => move.type !== type)) {
          finalCoverage.physical.push({
            id: "terablast" as ID,
            ePower: -1,
            cPower: -1,
            name: "Tera Blast",
            category: "Physical",
            type: type,
          });
        }
        if (finalCoverage.special.every((move) => move.type !== type)) {
          finalCoverage.special.push({
            id: "terablast" as ID,
            ePower: -1,
            cPower: -1,
            name: "Tera Blast",
            category: "Special",
            type: type,
          });
        }
      }
    }
    return finalCoverage;
  }

  async fullcoverage(): Promise<FullCoverage> {
    const cacheKey = `${this.ruleset.name}:${this.id}`;
    const cached = fullCoverageCache.get(cacheKey);
    let baseFullCoverage: FullCoverage;

    if (cached) {
      baseFullCoverage = cached;
    } else {
      const learnset = await this.learnset();
      const coverage: {
        physical: { [key: string]: Move[] };
        special: { [key: string]: Move[] };
      } = { physical: {}, special: {} };

      if (learnset) {
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
          let type = move.type;
          if (move.id === "ivycudgel") {
            if (this.requiredItem === "Wellspring Mask") type = "Water";
            else if (this.requiredItem === "Cornerstone Mask") type = "Rock";
            else if (this.requiredItem === "Hearthflame Mask") type = "Fire";
          }
          const category =
            move.category === "Physical" ? coverage.physical : coverage.special;
          addMove(category, move, type);
        });
      }

      const formatMoves = (movesByType: {
        [key: string]: Move[];
      }): { [key: string]: FullCoverageMove[] } => {
        return Object.fromEntries(
          Object.entries(movesByType).map(([type, moves]) => [
            type,
            moves
              .sort((a, b) => getEffectivePower(b) - getEffectivePower(a))
              .map((move) => ({
                value: 1 / moves.length,
                id: move.id,
                name: move.name,
                accuracy:
                  move.accuracy === true ? "-" : move.accuracy.toFixed(0),
                basePower: move.basePower ? move.basePower.toFixed(0) : "-",
                desc: move.shortDesc,
                type: type as TypeName,
                pp: (move.pp * 8) / 5,
                category: move.category,
              })),
          ])
        );
      };

      baseFullCoverage = {
        physical: formatMoves(coverage.physical),
        special: formatMoves(coverage.special),
      };
      fullCoverageCache.set(cacheKey, baseFullCoverage);
    }

    const learnset = await this.learnset();
    if (
      !this.capt?.tera ||
      this.capt.tera.length === 0 ||
      !learnset.some((m) => m.id === "terablast")
    ) {
      return baseFullCoverage;
    }

    const finalCoverage: FullCoverage = JSON.parse(
      JSON.stringify(baseFullCoverage)
    );
    const teraBlastMove = learnset.find((m) => m.id === "terablast");

    if (teraBlastMove) {
      for (const type of this.capt.tera) {
        if (type === "Stellar") continue;

        const teraBlastEntry: Omit<FullCoverageMove, "category"> = {
          value: 1,
          id: "terablast" as ID,
          name: "Tera Blast",
          accuracy:
            teraBlastMove.accuracy === true
              ? "-"
              : teraBlastMove.accuracy.toFixed(0),
          basePower: teraBlastMove.basePower
            ? teraBlastMove.basePower.toFixed(0)
            : "-",
          desc: teraBlastMove.shortDesc,
          type: type,
          pp: (teraBlastMove.pp * 8) / 5,
        };

        if (!finalCoverage.physical[type]) finalCoverage.physical[type] = [];
        finalCoverage.physical[type].unshift({
          ...teraBlastEntry,
          category: "Physical",
        });

        if (!finalCoverage.special[type]) finalCoverage.special[type] = [];
        finalCoverage.special[type].unshift({
          ...teraBlastEntry,
          category: "Special",
        });
      }
    }

    return finalCoverage;
  }

  async bestCoverage(oppTeam: DraftSpecie[]) {
    const coverage = await this.coverage();
    const allMoves = [...coverage.physical, ...coverage.special];
    const numMoves = allMoves.length;
    const numOpponents = oppTeam.length;

    if (numMoves <= 4) {
      allMoves.forEach((move) => (move.recommended = true));
      return coverage;
    }

    const damages: number[][] = allMoves.map((move) => {
      const stat =
        move.category === "Physical" ? this.baseStats.atk : this.baseStats.spa;
      return oppTeam.map((oppPokemon) => {
        const typeEffectiveness = oppPokemon.typechart();
        let value = move.ePower * (typeEffectiveness[move.type] || 1) * stat;
        if (move.stab) value *= 1.5;
        return value;
      });
    });

    const selectedMoveIndices = new Set<number>();
    const remainingMoveIndices = new Set<number>(
      Array.from({ length: numMoves }, (_, i) => i)
    );
    const maxEffectivenessPerOpponent = Array(numOpponents).fill(0);

    for (let i = 0; i < 4 && remainingMoveIndices.size > 0; i++) {
      let bestMoveIndex = -1;
      let maxGain = -1;

      for (const moveIndex of remainingMoveIndices) {
        let currentGain = 0;
        for (let j = 0; j < numOpponents; j++) {
          currentGain += Math.max(
            0,
            damages[moveIndex][j] - maxEffectivenessPerOpponent[j]
          );
        }

        if (currentGain > maxGain) {
          maxGain = currentGain;
          bestMoveIndex = moveIndex;
        }
      }

      if (bestMoveIndex !== -1) {
        selectedMoveIndices.add(bestMoveIndex);
        remainingMoveIndices.delete(bestMoveIndex);

        for (let j = 0; j < numOpponents; j++) {
          maxEffectivenessPerOpponent[j] = Math.max(
            maxEffectivenessPerOpponent[j],
            damages[bestMoveIndex][j]
          );
        }
      } else {
        break;
      }
    }

    selectedMoveIndices.forEach((index) => {
      allMoves[index].recommended = true;
    });
    return coverage;
  }

  async learnset(): Promise<Move[]> {
    const cacheKey = `${this.ruleset.name}:${this.id}:${
      this.ruleset.restriction || ""
    }`;
    const cached = learnsetCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const learnsetPromise = (async () => {
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
    learnsetCache.set(cacheKey, learnsetPromise);
    return learnsetPromise;
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
