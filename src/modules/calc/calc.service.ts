import {
  State,
  UnsupportedMoveError,
  accuracyBranches,
  assertSupported,
  critBranches,
  hitCountBranches,
  resolveTurns,
  resolveMove,
  secondaryBranches,
} from "@pdz/calc";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { BoostID, StatID, StatsTable, TypeName } from "@pkmn/data";
import {
  CalcOutcomeDto,
  CalcOverridesDto,
  CalcRequestDto,
  CalcResponseDto,
  CalcSideDto,
} from "./calc.dto";

const DEFAULT_RULESET = "Gen9 NatDex";
const DEFAULT_TURNS = 6;
const MAX_TURNS = 12;
const TURN_BUDGET_MS = 1500;
const MIN_TURN_RESOLVES = 0;
const MAX_TURN_RESOLVES = 4000;

@Injectable()
export class CalcService {
  calculate(request: CalcRequestDto): CalcResponseDto {
    const started = Date.now();
    const ruleset = getRuleset(request.ruleset ?? DEFAULT_RULESET);

    const state = this.buildState(ruleset, request);

    try {
      assertSupported(state);
    } catch (error) {
      if (error instanceof UnsupportedMoveError) {
        return {
          supported: false,
          reasons: error.reasons,
          input: this.describeInput(request, state),
        };
      }
      throw error;
    }

    const resolveStarted = Date.now();
    const distribution = resolveMove(state);
    const resolveMs = Math.max(Date.now() - resolveStarted, 0.05);
    const total = distribution.totalOutcomes;
    const startingHp = state.target.hp;
    const maxhp = state.target.maxhp;

    const outcomes: CalcOutcomeDto[] = distribution.outcomes
      .map((outcome) => {
        const hp = outcome.data.target.hp;
        return {
          probability: outcome.count / total,
          damage: startingHp - hp,
          hp,
          hpPercent: round((hp / maxhp) * 100, 2),
          fainted: hp <= 0,
          status: outcome.data.target.status,
          boosts: nonEmpty(outcome.data.target.boosts),
          attackerBoosts: nonEmpty(outcome.data.attacker.boosts),
        };
      })
      .sort((a, b) => a.damage - b.damage);

    const rolls = this.damageRolls(outcomes, maxhp);
    const turns = Math.min(request.turns ?? DEFAULT_TURNS, MAX_TURNS);

    return {
      supported: true,
      input: this.describeInput(request, state),
      branches: {
        accuracy: accuracyBranches(state.move),
        crit: critBranches(state),
        hits: hitCountBranches(ruleset.num, state.move, state.attacker),
        secondaries: secondaryBranches(state).map((branch) => ({
          effects: branch.effects.map(describeSecondary),
          weight: branch.weight,
        })),
      },
      damage: {
        min: rolls.length ? rolls[0].damage : 0,
        max: rolls.length ? rolls[rolls.length - 1].damage : 0,
        expected: round(
          outcomes.reduce((sum, o) => sum + o.damage * o.probability, 0),
          2,
        ),
        minPercent: rolls.length ? rolls[0].percent : 0,
        maxPercent: rolls.length ? rolls[rolls.length - 1].percent : 0,
        rolls,
      },
      outcomes,
      ko: this.knockout(state, turns, resolveMs),
      meta: {
        distinctOutcomes: distribution.size(),
        totalWeight: total,
        prunedMass: 0,
        elapsedMs: Date.now() - started,
      },
    };
  }

  private knockout(state: State, turns: number, resolveMs: number) {
    const affordable = Math.floor(TURN_BUDGET_MS / resolveMs);
    const projection = resolveTurns(state, {
      turns,
      maxResolves: Math.min(
        MAX_TURN_RESOLVES,
        Math.max(MIN_TURN_RESOLVES, affordable),
      ),
    });
    const chances = projection.knockoutByTurn;
    const incomplete = projection.unexpandedMass > 1e-9;
    const exactly = chances.map(
      (chance, index) => chance - (index ? chances[index - 1] : 0),
    );

    const resolved = exactly
      .map((probability, index) => ({ turn: index + 1, probability }))
      .filter((entry) => entry.probability > 1e-9);

    const unresolved = 1 - (chances[chances.length - 1] ?? 0);
    const guaranteedTurn = chances.findIndex((chance) => chance >= 1);
    const earliestTurn = resolved[0]?.turn;
    const likeliest = resolved.reduce(
      (best, entry) => (entry.probability > (best?.probability ?? 0) ? entry : best),
      resolved[0],
    );

    return {
      chances: chances.map((chance) => round(chance, 6)),
      exactlyOnTurn: exactly.map((chance) => round(chance, 6)),
      guaranteedTurn: guaranteedTurn === -1 ? undefined : guaranteedTurn + 1,
      earliestTurn,
      likeliestTurn: likeliest?.turn,
      unresolved: round(unresolved, 6),
      unexpanded: round(projection.unexpandedMass, 6),
      summary: this.knockoutSummary(resolved, unresolved, turns, incomplete),
    };
  }

  private knockoutSummary(
    resolved: { turn: number; probability: number }[],
    unresolved: number,
    turns: number,
    incomplete: boolean,
  ) {
    if (!resolved.length) {
      return incomplete
        ? `no knockout found within the compute budget (${turns} turns requested)`
        : `no knockout within ${turns} turn${turns === 1 ? "" : "s"}`;
    }

    const first = resolved[0].turn;
    const last = resolved[resolved.length - 1].turn;
    const likeliest = resolved.reduce((best, entry) =>
      entry.probability > best.probability ? entry : best,
    );

    const range = first === last ? `${first}` : `${first}–${last}`;
    const tail =
      unresolved <= 1e-9
        ? ""
        : incomplete
          ? `, ${(unresolved * 100).toFixed(1)}% unresolved — the search hit its compute budget, so later turns are a lower bound`
          : `, ${(unresolved * 100).toFixed(1)}% still standing after ${turns}`;

    return `${likeliest.turn}HKO — ${range} turns (${(likeliest.probability * 100).toFixed(1)}% on turn ${likeliest.turn})${tail}`;
  }

  private damageRolls(outcomes: CalcOutcomeDto[], maxhp: number) {
    const merged = new Map<number, number>();
    for (const outcome of outcomes) {
      merged.set(
        outcome.damage,
        (merged.get(outcome.damage) ?? 0) + outcome.probability,
      );
    }
    return [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([damage, probability]) => ({
        damage,
        percent: round((damage / maxhp) * 100, 2),
        probability: round(probability, 6),
      }));
  }

  private buildState(
    ruleset: ReturnType<typeof getRuleset>,
    request: CalcRequestDto,
  ): State {
    const attacker = this.buildPokemon(ruleset, request.attacker, "attacker");
    const defender = this.buildPokemon(ruleset, request.defender, "defender");

    let move: State.Move;
    try {
      move = State.createMove(ruleset, request.move);
    } catch {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        field: "move",
        value: request.move,
      });
    }

    move = this.applyOverrides(move, request.overrides);

    const field = State.createField(ruleset, {
      weather: request.field?.weather || undefined,
      terrain: request.field?.terrain || undefined,
    });

    return State.oneOnOne(ruleset, attacker, defender, move, field);
  }

  private applyOverrides(
    move: State.Move,
    overrides: CalcOverridesDto | undefined,
  ): State.Move {
    if (!overrides) return move;

    const patch: Record<string, unknown> = {};

    if (overrides.hit === "always") patch.accuracy = true;
    if (overrides.hit === "never") patch.accuracy = 0;

    if (overrides.crit === "always") patch.crit = true;
    if (overrides.crit === "never") {
      patch.crit = false;
      patch.critRatio = 0;
    }

    return { ...move, ...patch } as State.Move;
  }

  private buildPokemon(
    ruleset: ReturnType<typeof getRuleset>,
    side: CalcSideDto,
    which: string,
  ) {
    try {
      const pokemon = State.createPokemon(ruleset, side.species, {
        level: side.level,
        ability: side.ability || undefined,
        item: side.item || undefined,
        nature: side.nature || undefined,
        evs: side.evs as Partial<StatsTable> | undefined,
        ivs: side.ivs as Partial<StatsTable> | undefined,
        boosts: side.boosts as Partial<Record<BoostID, number>> | undefined,
        status: side.status || undefined,
        teraType: (side.teraType as TypeName) || undefined,
        terastallized: side.terastallized,
      });
      if (typeof side.hp === "number") pokemon.hp = side.hp;
      return pokemon;
    } catch (error) {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        field: which,
        value: (error as Error).message,
      });
    }
  }

  private describeInput(request: CalcRequestDto, state: State) {
    return {
      ruleset: request.ruleset ?? DEFAULT_RULESET,
      gen: state.gen.num,
      attacker: describePokemon(state.attacker),
      defender: describePokemon(state.target),
      move: {
        name: state.move.name,
        id: state.move.id,
        type: state.move.type,
        category: state.move.category,
        basePower: state.move.basePower,
        accuracy: state.move.accuracy,
        critRatio: state.move.critRatio,
        priority: state.move.priority,
        multihit: state.move.multihit,
        multiaccuracy: state.move.multiaccuracy,
        target: state.move.target,
        flags: state.move.flags,
        secondaries: (state.move.secondaries ?? []).map(describeSecondary),
      },
      field: {
        weather: state.field.weather,
        terrain: state.field.terrain,
      },
      overrides: {
        hit: request.overrides?.hit ?? "roll",
        crit: request.overrides?.crit ?? "roll",
      },
    };
  }
}

function describePokemon(pokemon: State.Pokemon) {
  return {
    species: pokemon.species.name,
    level: pokemon.level,
    types: pokemon.types,
    teraType: pokemon.teraType,
    terastallized: pokemon.terastallized ?? false,
    ability: pokemon.ability,
    item: pokemon.item,
    nature: pokemon.nature,
    status: pokemon.status,
    hp: pokemon.hp,
    maxhp: pokemon.maxhp,
    baseStats: pokemon.species.baseStats,
    evs: pokemon.evs,
    ivs: pokemon.ivs,
    boosts: nonEmpty(pokemon.boosts),
    weighthg: pokemon.weighthg,
  };
}

function describeSecondary(secondary: {
  chance?: number;
  status?: string;
  volatileStatus?: string;
  boosts?: Partial<Record<BoostID, number>>;
  self?: { boosts?: Partial<Record<BoostID, number>> };
}) {
  const parts: string[] = [];
  if (secondary.status) parts.push(secondary.status);
  if (secondary.volatileStatus) parts.push(secondary.volatileStatus);
  if (secondary.boosts) parts.push(`target ${describeBoosts(secondary.boosts)}`);
  if (secondary.self?.boosts) {
    parts.push(`self ${describeBoosts(secondary.self.boosts)}`);
  }
  const effect = parts.join(", ") || "no modelled effect";
  return `${secondary.chance ?? 100}% ${effect}`;
}

function describeBoosts(boosts: Partial<Record<BoostID, number>>) {
  return Object.entries(boosts)
    .map(([stat, value]) => `${value > 0 ? "+" : ""}${value} ${stat}`)
    .join(" ");
}

function nonEmpty(boosts: Partial<Record<BoostID | StatID, number>>) {
  const entries = Object.entries(boosts).filter(([, value]) => !!value);
  return entries.length
    ? (Object.fromEntries(entries) as Record<string, number>)
    : undefined;
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
