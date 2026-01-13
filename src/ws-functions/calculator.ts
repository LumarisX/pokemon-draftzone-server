import { Server, Socket } from "socket.io";
import {
  JsonRpcRequest,
  sendError,
  sendResponse,
} from "../services/websocket.service";
import { WSRoute } from "../websocket";
import { logger } from "../app";
import {
  calculate as smogCalculate,
  Move as SmogMove,
  Pokemon as SmogPokemon,
} from "@smogon/calc";
import { DMG } from "../../../dmg/src/new-mechanics/dmg";
import { getRuleset } from "../data/rulesets";
import { computeTurn, TurnResult } from "../../../dmg/src/new-mechanics/poc";
import {
  exportTreeToGraphviz,
  printOutput,
} from "../../../dmg/src/new-mechanics/tests";

export interface CalculatorParams {
  attacker: {
    name: string;
    move: string;
    item?: string;
    crit?: boolean;
    alwaysHits?: boolean;
    level?: number;
    evs?: Record<string, number>;
    ivs?: Record<string, number>;
    nature?: string;
  };
  defender: {
    name: string;
    move?: string;
    item?: string;
    crit?: boolean;
    alwaysHits?: boolean;
    level?: number;
    evs?: Record<string, number>;
    ivs?: Record<string, number>;
    nature?: string;
  };
}

/**
 * Normalizes Smogon calculator results to {hp, probability}[] format with unique HP values
 */
function normalizeSmogOutcomes(
  smogResult: any
): { hp: number; probability: number }[] {
  const outcomes = new Map<number, number>(); // hp -> probability
  const maxHP = smogResult.defender.maxHP();

  if (Array.isArray(smogResult.damage)) {
    smogResult.damage.forEach((damageOutcome: any) => {
      if (Array.isArray(damageOutcome)) {
        // Multiple rolls within this outcome
        const outcomeCount = damageOutcome.length;
        damageOutcome.forEach((damage: number) => {
          const remainingHP = maxHP - damage;
          const probability = outcomes.get(remainingHP) || 0;
          outcomes.set(remainingHP, probability + 1 / outcomeCount);
        });
      } else {
        // Single damage value for this outcome
        const remainingHP = maxHP - damageOutcome;
        const probability = outcomes.get(remainingHP) || 0;
        outcomes.set(remainingHP, probability + 1);
      }
    });

    // Normalize probabilities to sum to 1
    const totalWeight = Array.from(outcomes.values()).reduce(
      (sum, p) => sum + p,
      0
    );
    return Array.from(outcomes.entries())
      .map(([hp, probability]) => ({
        hp,
        probability: probability / totalWeight,
      }))
      .sort((a, b) => b.hp - a.hp);
  }

  return [];
}

/**
 * WebSocket handler for calculator.calculate
 * Receives attacker and defender Pokemon data and returns damage calculations
 */
export const calculateDamage: WSRoute =
  (io: Server, socket: Socket) => async (request: JsonRpcRequest) => {
    try {
      const params = request.params as CalculatorParams;

      // Validate required parameters
      if (!params.attacker?.name || !params.defender?.name) {
        return sendError(
          socket,
          -32602,
          "Invalid params: missing attacker or defender name",
          request.id
        );
      }

      logger.info(
        `Calculator request from ${socket.id}: ${params.attacker.name} using ${params.attacker.move} vs ${params.defender.name}`
      );

      const genNum = 9;

      const smogAtt = new SmogPokemon(genNum, params.attacker.name, {
        item: params.attacker.item,
        level: params.attacker.level ?? 100,
        nature: params.attacker.nature,
      });

      const smogDef = new SmogPokemon(genNum, params.defender.name, {
        item: params.defender.item,
        level: params.defender.level ?? 100,
        nature: params.defender.nature,
      });

      const smogMove = new SmogMove(genNum, params.attacker.move, {});
      const smogResult = smogCalculate(genNum, smogAtt, smogDef, smogMove);
      const smogOutcomes = normalizeSmogOutcomes(smogResult);

      console.log(smogResult.desc(), smogOutcomes);

      const gen = getRuleset("ZA NatDex");

      const attacker = new DMG.Pokemon(gen, params.attacker.name, {
        level: params.attacker.level,
        nature: params.attacker.nature,
        item: params.attacker.item,
      });
      const target = new DMG.Pokemon(gen, params.defender.name, {
        level: params.defender.level,
        nature: params.defender.nature,
        item: params.defender.item,
      });
      const move = new DMG.Move(gen, params.attacker.move, {
        crit: params.attacker.crit,
        alwaysHit: params.attacker.alwaysHits,
      });

      const TURNS = 1;
      let turnResult: TurnResult | { outcomes: undefined; tree: undefined } = {
        outcomes: undefined,
        tree: undefined,
      };

      for (let turn = 0; turn < TURNS; turn++) {
        turnResult = computeTurn(
          attacker,
          target,
          move,
          turnResult.tree,
          turnResult.outcomes
        );
      }

      if (turnResult.outcomes && turnResult.tree) {
        printOutput(turnResult.outcomes);
      }

      // TODO: Implement actual damage calculation using @pkmn/dmg
      // For now, return a mock response
      const mockResult = {
        success: true,
        calculation: {
          attacker: {
            name: params.attacker.name,
            maxHP: target.stats.hp,
          },
          defender: {
            name: params.defender.name,
            maxHP: target.stats.hp,
          },
          move: params.attacker.move,
          smogon: {
            outcomes: smogOutcomes,
          },
          dmg: {
            outcomes: turnResult.outcomes?.map((o) => ({
              probability: o.probability,
              hp: o.state.hp,
            })),
          },
        },
        message: "Calculation result",
      };

      sendResponse(socket, mockResult, request.id);
    } catch (error: any) {
      logger.error(`Calculator error: ${error.message}`, error);
      sendError(
        socket,
        -32000,
        error.message || "Calculation failed",
        request.id
      );
    }
  };
