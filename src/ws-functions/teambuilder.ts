import { ID, Move, TypeName } from "@pkmn/data";
import { Server, Socket } from "socket.io";
import { pdzCalculateMove } from "../../../dmg/src/mechanics";
import { PokemonOptions, State } from "../../../dmg/src/state";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { getEffectivePower } from "../services/data-services/move.service";
import { JsonRpcRequest, sendResponse } from "../services/websocket.service";
import { WSRoute } from "../websocket";

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

// Helper function to check if move is STAB
function isStab(move: Move, pokemon: PokemonSet): boolean {
  return pokemon.types.includes(move.type);
}

function strength(
  move: Move,
  pokemon: PokemonSet,
  specie: DraftSpecie
): number {
  const stat =
    move.category === "Physical"
      ? specie.baseStats.atk
      : move.category === "Special"
      ? specie.baseStats.spa
      : 1;
  let value =
    getEffectivePower(move) *
    stat *
    (isStab(move, pokemon)
      ? pokemon.ability === "Adaptability"
        ? 2
        : 1.5
      : 1);
  return value;
}

// API Handlers
export const shouldHighlightMove: WSRoute =
  (io: Server, socket: Socket) =>
  async (
    request: JsonRpcRequest<{
      ability: string;
      move: Move;
      pokemon?: PokemonSet;
    }>
  ) => {
    try {
      const { ability, move, pokemon } = request.params;

      // Validate input
      if (!ability || !move) {
        sendResponse(socket, false, request.id);
        return;
      }

      // For Adaptability, we need to check if it's a STAB move
      if (ability === "Adaptability" && pokemon) {
        const result = isStab(move, pokemon);
        sendResponse(socket, result, request.id);
        return;
      }

      sendResponse(socket, false, request.id);
    } catch (error) {
      console.error("Error in shouldHighlightMove:", error);
      sendResponse(socket, false, request.id);
    }
  };

export const shouldHighlightItem: WSRoute =
  (io: Server, socket: Socket) =>
  async (request: JsonRpcRequest<{ ability: string; item: Item }>) => {
    try {
      const { ability, item } = request.params;

      // Validate input
      if (!ability || !item) {
        sendResponse(socket, false, request.id);
        return;
      }

      sendResponse(socket, false, request.id);
    } catch (error) {
      console.error("Error in shouldHighlightItem:", error);
      sendResponse(socket, false, request.id);
    }
  };

export const getModifiedMove: WSRoute =
  (io: Server, socket: Socket) =>
  async (
    request: JsonRpcRequest<{
      ability: string;
      move: Move;
      pokemon?: PokemonSet;
    }>
  ) => {
    try {
      const { ability, move, pokemon } = request.params;

      // Validate input
      if (!ability || !move) {
        sendResponse(socket, undefined, request.id);
        return;
      }

      sendResponse(socket, undefined, request.id);
    } catch (error) {
      console.error("Error in getModifiedMove:", error);
      sendResponse(socket, undefined, request.id);
    }
  };

export const getModifiedType: WSRoute =
  (io: Server, socket: Socket) =>
  async (request: JsonRpcRequest<{ move: Move; pokemon: PokemonSet }>) => {
    try {
      const { move, pokemon } = request.params;

      // Validate input
      if (!move || !pokemon) {
        sendResponse(socket, undefined, request.id);
        return;
      }

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

export const getProcessedLearnset: WSRoute =
  (io: Server, socket: Socket) =>
  async (
    request: JsonRpcRequest<{
      pokemon: PokemonSet & Partial<PokemonOptions>;
      ruleset: string;
    }>
  ) => {
    try {
      const { pokemon, ruleset: rulesetId } = request.params;

      // Validate input
      if (!pokemon || !pokemon.id || !rulesetId) {
        console.error(
          "Invalid parameters for getProcessedLearnset:",
          request.params
        );
        sendResponse(socket, [], request.id);
        return;
      }

      const ruleset = getRuleset(rulesetId);
      if (!ruleset) {
        console.error(`Invalid ruleset: ${rulesetId}`);
        sendResponse(socket, [], request.id);
        return;
      }

      const specie = new DraftSpecie(pokemon.id, ruleset);

      const statePokemon = State.createPokemon(ruleset, pokemon.id, {
        ability: pokemon.ability,
        level: pokemon.level,
        item: pokemon.item,
        nature: pokemon.nature,
        status: pokemon.status,
        hpPercent: pokemon.hpPercent,
        happiness: pokemon.happiness,
        evs: pokemon.evs,
        ivs: pokemon.ivs,
        boosts: pokemon.boosts,
        teraType: pokemon.teraType,
      });

      const processedMoves: ClientMove[] = (await specie.learnset())
        .map((move) => {
          const stateMove = State.createMove(ruleset, move.id);
          const {
            move: contextMove,
            pokemon: contextPokemon,
            strength,
          } = pdzCalculateMove(ruleset, statePokemon, stateMove);

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
            modified: {
              basePower:
                contextPokemon.move?.relevant.modified.basePower || undefined,
            },
          };
          return clientMove;
        })
        .sort((a, b) => b.strength - a.strength);
      sendResponse(socket, processedMoves, request.id);
    } catch (error: any) {
      console.error("Error in getProcessedLearnset:", {
        error: error.message || error,
        pokemon: request.params?.pokemon?.id,
        ruleset: request.params?.ruleset,
        stack: error.stack,
      });
      sendResponse(socket, [], request.id);
    }
  };
