import { ID, Move, TypeName } from "@pkmn/data";
// import { pdzCalculateMove } from "../../../dmg/src/mechanics";
// import { PokemonOptions, State } from "../../../dmg/src/state";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { getEffectivePower } from "../services/data-services/move.service";
import { wsRoute, WSRouteGroup } from ".";

export interface Item {
  readonly id: string;
  readonly pngId: string;
  readonly name: string;
  readonly desc: string;
  readonly tags: string[];
}

export interface PokemonSet {
  id: ID;
  types: [string] | [string, string];
  teraType: TypeName;
  ability: string;
  moves: (Move | null)[];
}

export type ModifiedMove = Move & {
  modified?: {
    basePower?: boolean;
    type?: boolean;
    accuracy?: boolean;
  };
};

type HighlightMoveParams = {
  ability: string;
  move: Move;
  pokemon?: PokemonSet;
};

type HighlightItemParams = {
  ability: string;
  item: Item;
};

type ModifiedTypeParams = {
  move: Move;
  pokemon: PokemonSet;
};

type ClientMove = {
  id: string;
  name: string;
  type: TypeName;
  category: "Physical" | "Special" | "Status";
  basePower: number;
  accuracy: number | true;
  modified?: { basePower?: true; accuracy?: true; type?: true };
  pp: number;
  desc: string;
  tags: string[];
  isStab: boolean;
  strength: number;
};

type PokemonOptions = {};

const CRIT_KEY: number[] = [0, 1, 3, 12] as const;
const situationalMoves = ["steelroller", "dreameater"];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const hasString = (value: unknown): value is string => {
  return typeof value === "string" && value.length > 0;
};

const isHighlightMoveParams = (params: unknown): params is HighlightMoveParams => {
  if (!isRecord(params)) {
    return false;
  return hasString(params.ability) && Boolean(params.move);
};

const isHighlightItemParams = (params: unknown): params is HighlightItemParams => {
  if (!isRecord(params)) {
    return false;
  }
  return hasString(params.ability) && Boolean(params.item);
};

const isModifiedTypeParams = (params: unknown): params is ModifiedTypeParams => {
  if (!isRecord(params)) {
    return false;
  }
  return Boolean(params.move) && Boolean(params.pokemon);
};

const isProcessedLearnsetParams = (
  params: unknown,
): params is ProcessedLearnsetParams => {
  if (!isRecord(params)) {
    return false;
  }

  if (!hasString(params.ruleset) || !isRecord(params.pokemon)) {
    return false;
  }

  return hasString(params.pokemon.id);

function isStab(move: Move, pokemon: PokemonSet): boolean {
  return pokemon.types.includes(move.type);
}

function pdzEffectivePowerModifier(move: Move) {
  let value = 1;
  if (move.accuracy !== true && move.accuracy < 100)
    value *= move.accuracy / 100;
  value *=
    !move.willCrit && move.critRatio && move.critRatio < CRIT_KEY.length
    ? 1 + (1.5 * CRIT_KEY[move.critRatio]) / 24
    : 1.5;
  if (Array.isArray(move.multihit)) {
    if (move.multihit[0] === 2 && move.multihit[1] === 5) value *= 3.3;
    else value *= (move.multihit[0] + move.multihit[1]) / 2;
  } else if (typeof move.multihit === "number" && move.multihit > 1)
    value *= move.multihit;
  if (move.condition?.duration) value /= move.condition.duration === 1 ? 4 : 2;
  if ("charge" in move.flags || "recharge" in move.flags) value *= 0.5;
  if (move.self?.volatileStatus === "lockedmove") value *= 0.5;
  if (move.mindBlownRecoil) value *= 0.5;
  if (move.id in situationalMoves) value *= 0.1;
  if (move.selfdestruct) value *= 0.01;
  return value;
}

function pdzCalculateStrength(pokemon: DraftSpecie, move: Move): number {
  if (!move) return 0;
  const attackStat = move.overrideOffensiveStat
    ? pokemon.baseStats[move.overrideOffensiveStat]
    : move.category === "Physical"
      ? pokemon.baseStats.atk
      : move.category === "Special"
        ? pokemon.baseStats.spa
        : 0;
  const baseDamage = move.basePower * attackStat;
  const stabMod = 0x1800;
  let damageAmount = baseDamage;
  damageAmount = (damageAmount * stabMod) / 0x1000;
  const epMod = pdzEffectivePowerModifier(move);
  damageAmount = damageAmount * epMod;
  return Math.round((damageAmount * 10) / 2048) / 10;
}

export const shouldHighlightMove = wsRoute<HighlightMoveParams, boolean>(
  ({ params }) => {
    if (params.ability === "Adaptability" && params.pokemon) {
      return isStab(params.move, params.pokemon);
    }

    return false;
  },
  {
    validateParams: isHighlightMoveParams,
    invalidParamsResult: false,
    onErrorResult: false,
  },
);

export const shouldHighlightItem = wsRoute<HighlightItemParams, boolean>(
  () => false,
  {
    validateParams: isHighlightItemParams,
    invalidParamsResult: false,
    onErrorResult: false,
  },
);

export const getModifiedMove = wsRoute<HighlightMoveParams, ModifiedMove | undefined>(
  () => undefined,
  {
  validateParams: isHighlightMoveParams,
  invalidParamsResult: undefined,
  onErrorResult: undefined,
  },
);

export const getModifiedType = wsRoute<ModifiedTypeParams, TypeName | undefined>(
  () => undefined,
  {
  validateParams: isModifiedTypeParams,
  invalidParamsResult: undefined,
  onErrorResult: undefined,
  },
);

export const getProcessedLearnset = wsRoute<
  ProcessedLearnsetParams,
  ClientMove[]
>(
  async ({ params }) => {
    const { pokemon, ruleset: rulesetId } = params;

    const ruleset = getRuleset(rulesetId);
    if (!ruleset) {
      console.error(`Invalid ruleset: ${rulesetId}`);
      return [];
  }

  const specie = new DraftSpecie(pokemon.id as ID, ruleset);

    const processedMoves: ClientMove[] = (await specie.learnset())
      .map((move) => {
        const contextMove = move;
  const strength = pdzCalculateStrength(specie, move);

  const tags: string[] = [];
  if (move.flags.bite) tags.push("Bite");
  if (move.flags.punch) tags.push("Punch");
  if (move.flags.sound) tags.push("Sound");
  if (move.recoil) tags.push("Recoil");
  if (move.multihit) tags.push("Multi-Hit");
  if (move.flags.charge || move.flags.recharge) tags.push("Charge");
  if (move.critRatio && move.critRatio > 1) tags.push("Crit");
  if (move.flags.contact) tags.push("Contact");
  if (move.flags.pulse) tags.push("Pulse");
  if (move.flags.heal) tags.push("Healing");
  if (move.flags.slicing) tags.push("Slicing");
  if (move.isZ) tags.push("Z");
  if (move.isMax) tags.push("Max");
  if (move.flags.bullet) tags.push("Bullet");
  if (move.flags.wind) tags.push("Wind");

        const clientMove: ClientMove = {
          id: contextMove.id,
          name: contextMove.name,
          basePower: contextMove.basePower,
          type: contextMove.type,
          category: contextMove.category,
          isStab: isStab({ ...move, type: contextMove.type }, pokemon),
          accuracy: move.accuracy,
          desc: move.shortDesc,
          pp: move.pp,
          strength,
          tags,
  };

  return clientMove;
      })
      .sort((a, b) => b.strength - a.strength);

    return processedMoves;
  },
  {
    validateParams: isProcessedLearnsetParams,
    invalidParamsResult: [],
    onErrorResult: [],
  },
);

export const teambuilderWsGroup: WSRouteGroup = {
  namespace: "teambuilder",
  routes: {
    shouldHighlightMove,
    shouldHighlightItem,
    getModifiedMove,
    getModifiedType,
    getProcessedLearnset,
  },
};
import { ID, Move, TypeName } from "@pkmn/data";
// import { pdzCalculateMove } from "../../../dmg/src/mechanics";
// import { PokemonOptions, State } from "../../../dmg/src/state";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { getEffectivePower } from "../services/data-services/move.service";
import { wsRoute, WSRouteGroup } from ".";

export interface Item {
  readonly id: string;
  readonly pngId: string;
  readonly name: string;
  readonly desc: string;
  readonly tags: string[];
}

export interface PokemonSet {
  id: ID;
  types: [string] | [string, string];
  teraType: TypeName;
  ability: string;
  moves: (Move | null)[];
}

export type ModifiedMove = Move & {
  modified?: {
    basePower?: boolean;
    type?: boolean;
    accuracy?: boolean;
      ? pokemon.ability === "Adaptability"
        ? 2
        : 1.5
      : 1);
  return value;
        () => undefined,

type HighlightMoveParams = {
  ability: string;
  move: Move;
  pokemon?: PokemonSet;
};

type HighlightItemParams = {
  ability: string;
  item: Item;
};

type ModifiedTypeParams = {
  move: Move;
  pokemon: PokemonSet;
};

type ProcessedLearnsetParams = {
  pokemon: PokemonSet & Partial<PokemonOptions>;
  ruleset: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const hasString = (value: unknown): value is string => {
  return typeof value === "string" && value.length > 0;
};

const isHighlightMoveParams = (params: unknown): params is HighlightMoveParams => {
  if (!isRecord(params)) {
    return false;
  }

  return hasString(params.ability) && Boolean(params.move);
};

const isHighlightItemParams = (params: unknown): params is HighlightItemParams => {
  if (!isRecord(params)) {
    return false;
  }

  return hasString(params.ability) && Boolean(params.item);
};

const isModifiedTypeParams = (params: unknown): params is ModifiedTypeParams => {
  if (!isRecord(params)) {
    return false;
  }

  return Boolean(params.move) && Boolean(params.pokemon);
};

const isProcessedLearnsetParams = (
  params: unknown,
): params is ProcessedLearnsetParams => {
  if (!isRecord(params)) {
    return false;
  }

  if (!hasString(params.ruleset) || !isRecord(params.pokemon)) {
    return false;
  }

  return hasString(params.pokemon.id);
};

export const shouldHighlightMove = wsRoute<HighlightMoveParams, boolean>(
  ({ params }) => {
    if (params.ability === "Adaptability" && params.pokemon) {
      return isStab(params.move, params.pokemon);
    }

    return false;
  },
  {
    validateParams: isHighlightMoveParams,
    invalidParamsResult: false,
    onErrorResult: false,
  },
);

export const shouldHighlightItem = wsRoute<HighlightItemParams, boolean>(
  () => false,
  {
    validateParams: isHighlightItemParams,
    invalidParamsResult: false,
    onErrorResult: false,
  },
);

export const getModifiedMove = wsRoute<HighlightMoveParams, ModifiedMove | undefined>(
  () => undefined,
  {
    validateParams: isHighlightMoveParams,
    invalidParamsResult: undefined,
    onErrorResult: undefined,
  },
);

export const getModifiedType = wsRoute<ModifiedTypeParams, TypeName | undefined>(
  () => undefined,
  {
    validateParams: isModifiedTypeParams,
    invalidParamsResult: undefined,
    onErrorResult: undefined,
  },
);
        {
          validateParams: isHighlightMoveParams,
          invalidParamsResult: undefined,
          onErrorResult: undefined,
        },
      );

      export const getModifiedType = wsRoute<ModifiedTypeParams, TypeName | undefined>(
        () => undefined,
        {
          validateParams: isModifiedTypeParams,
          invalidParamsResult: undefined,
          onErrorResult: undefined,
        },
      );

      sendResponse(socket, undefined, request.id);
    } catch (error) {
      console.error("Error in getModifiedType:", error);
      sendResponse(socket, undefined, request.id);
    }
  };

type ClientMove = {
  id: string;
  name: string;
  type: TypeName;
  category: "Physical" | "Special" | "Status";
  basePower: number;
  accuracy: number | true;
  modified?: { basePower?: true; accuracy?: true; type?: true };
  pp: number;
  desc: string;
  tags: string[];
  isStab: boolean;
  strength: number;
};

type PokemonOptions = {};

const CRIT_KEY: number[] = [0, 1, 3, 12] as const;
const situationalMoves = ["steelroller", "dreameater"];

function pdzEffectivePowerModifier(move: Move) {
  let value = 1;
  if (move.accuracy !== true && move.accuracy < 100)
    value *= move.accuracy / 100;
  value *=
    !move.willCrit && move.critRatio && move.critRatio < CRIT_KEY.length
      ? 1 + (1.5 * CRIT_KEY[move.critRatio]) / 24
      : 1.5;
  if (Array.isArray(move.multihit)) {
    if (move.multihit[0] === 2 && move.multihit[1] === 5) value *= 3.3;
    else value *= (move.multihit[0] + move.multihit[1]) / 2;
  } else if (typeof move.multihit === "number" && move.multihit > 1)
    value *= move.multihit;
  if (move.condition?.duration) value /= move.condition.duration === 1 ? 4 : 2;
  if ("charge" in move.flags || "recharge" in move.flags) value *= 0.5;
  if (move.self?.volatileStatus === "lockedmove") value *= 0.5;
  if (move.mindBlownRecoil) value *= 0.5;
  if (move.id in situationalMoves) value *= 0.1;
  if (move.selfdestruct) value *= 0.01;
  return value;
}

function pdzCalculateStrength(pokemon: DraftSpecie, move: Move): number {
  if (!move) return 0;
  const attackStat = move.overrideOffensiveStat
    ? pokemon.baseStats[move.overrideOffensiveStat]
    : move.category === "Physical"
      ? pokemon.baseStats.atk
      : move.category === "Special"
        ? pokemon.baseStats.spa
        : 0;
  const baseDamage = move.basePower * attackStat;
  const stabMod = 0x1800;
  let damageAmount = baseDamage;
  damageAmount = (damageAmount * stabMod) / 0x1000;
  const epMod = pdzEffectivePowerModifier(move);
  damageAmount = damageAmount * epMod;
  return Math.round((damageAmount * 10) / 2048) / 10;
}

export const getProcessedLearnset = wsRoute<
  ProcessedLearnsetParams,
  ClientMove[]
>(
  async ({ params }) => {
    const { pokemon, ruleset: rulesetId } = params;

    const ruleset = getRuleset(rulesetId);
    if (!ruleset) {
      console.error(`Invalid ruleset: ${rulesetId}`);
      return [];
    }

    const specie = new DraftSpecie(pokemon.id as ID, ruleset);

      // const statePokemon = State.createPokemon(ruleset, pokemon.id, {
      //   ability: pokemon.ability,
      //   level: pokemon.level,
      //   item: pokemon.item,
      //   nature: pokemon.nature,
      //   status: pokemon.status,
      //   hpPercent: pokemon.hpPercent,
      //   happiness: pokemon.happiness,
      //   evs: pokemon.evs,
      //   ivs: pokemon.ivs,
      //   boosts: pokemon.boosts,
      //   teraType: pokemon.teraType,
      // });

    const processedMoves: ClientMove[] = (await specie.learnset())
      .map((move) => {
          // const stateMove = State.createMove(ruleset, move.id);
          // const {
          //   move: contextMove,
          //   pokemon: contextPokemon,
          //   strength,
          // } = pdzCalculateMove(ruleset, statePokemon, stateMove);

        const contextMove = move;
        const strength = pdzCalculateStrength(specie, move);

        const tags: string[] = [];
        if (move.flags.bite) tags.push("Bite");
        if (move.flags.punch) tags.push("Punch");
        if (move.flags.sound) tags.push("Sound");
        if (move.recoil) tags.push("Recoil");
        if (move.multihit) tags.push("Multi-Hit");
        if (move.flags.charge || move.flags.recharge) tags.push("Charge");
        if (move.critRatio && move.critRatio > 1) tags.push("Crit");
        if (move.flags.contact) tags.push("Contact");
        if (move.flags.pulse) tags.push("Pulse");
        if (move.flags.heal) tags.push("Healing");
        if (move.flags.slicing) tags.push("Slicing");
        if (move.isZ) tags.push("Z");
        if (move.isMax) tags.push("Max");
        if (move.flags.bullet) tags.push("Bullet");
        if (move.flags.wind) tags.push("Wind");

        const clientMove: ClientMove = {
          id: contextMove.id,
          name: contextMove.name,
          basePower: contextMove.basePower,
          type: contextMove.type,
          category: contextMove.category,
          isStab: isStab({ ...move, type: contextMove.type }, pokemon),
          accuracy: move.accuracy,
          desc: move.shortDesc,
          pp: move.pp,
          strength,
          tags,
            // modified: {
            //   basePower:
            //     contextPokemon.move?.relevant.modified.basePower || undefined,
            // },
        };
        return clientMove;
      })
      .sort((a, b) => b.strength - a.strength);

    return processedMoves;
  },
  {
    validateParams: isProcessedLearnsetParams,
    invalidParamsResult: [],
    onErrorResult: [],
  },
);

export const teambuilderWsGroup: WSRouteGroup = {
  namespace: "teambuilder",
  routes: {
    shouldHighlightMove,
    shouldHighlightItem,
    getModifiedMove,
    getModifiedType,
    getProcessedLearnset,
  },
};
