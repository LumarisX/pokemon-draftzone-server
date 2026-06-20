import { Injectable } from "@nestjs/common";
import { Data, GenderName, Generations, ID, toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { ReplayLine, ParsedReplayLog } from "./replay-parse.service";
import { HP, HPSTATUS } from "./replay-analysis.types";

const SIDE_IDS = ["p1", "p2", "p3", "p4"] as const;
const POSITION_IDS = ["a", "b", "c"] as const;
const replayExists: (d: Data) => boolean = (d) => d.exists === true;
const gens = new Generations(Dex, replayExists);

type SideId = (typeof SIDE_IDS)[number];
type PositionId = (typeof POSITION_IDS)[number];

export type HPState = {
  raw: string;
  current?: number;
  max?: number;
  percent?: number;
};

export type MoveData = {
  turnNumber: number;
  raw: string;
  target?: string;
};

export type DamageData = {
  turnNumber: number;
  damageTaken: number;
  indirect?: boolean;
  friendlyFire?: boolean;
  selfInflicted?: boolean;
  move?: string;
  cause?: string;
  attacker?: string;
  attackerSideId?: SideId;
  hpBefore: number;
  hpAfter: number;
};

export type CritLuckEvent = {
  turnNumber: number;
  move: string;
  target?: string;
  /** Probability (0-1) this hit would crit, derived from the move's critRatio. */
  expected: number;
  /** Whether a -crit line was actually observed for this hit. */
  hit: boolean;
};

export type MissLuckEvent = {
  turnNumber: number;
  move: string;
  target?: string;
  /** Probability (0-1) this hit would land, derived from the move's accuracy. */
  expected: number;
  /** Whether the move actually landed (false if a -miss line was observed). */
  hit: boolean;
};

export type FaintState = {
  turnNumber: number;
  sourceAction: string;
  attackerSideId?: SideId;
  attackerPokemon?: string;
  move?: string;
  cause?: string;
  indirect?: boolean;
};

export type PokemonKey = string; // Format: `${sideId}: ${speciesId}`

export type Pokemon = {
  key: PokemonKey;
  sideId: SideId;
  nickname: string;
  species?: string;
  baseSpecies?: string;
  speciesHistory: string[];
  detailsHistory: string[];
  moveset: string[];
  moveHistory: Record<string, MoveData[]>;
  damageHistory: DamageData[];
  critHistory: CritLuckEvent[];
  missHistory: MissLuckEvent[];
  details?: string;
  hp: HPState;
  status?: SetterState;
  fainted?: FaintState;
  item?: SetterState;
  ability?: string;
  teraType?: string;
  shiny?: true;
  gender?: GenderName;
  boosts: Boosts;
  flags: {
    destinyBond?: string;
  };
};

export type Position = {
  id: PositionId;
  pokemon?: Pokemon;
  conditions: ConditionState[];
};

export type Side = {
  id: SideId;
  username?: string;
  teamSize?: number;
  stats: {
    switches: number;
  };
  conditions: ConditionState[];
  positions: Record<PositionId, Position>;
  pokemon: Record<string, Pokemon>;
};

export type Field = {
  turnNumber: number;
  timestampStart?: number;
  timestampEnd?: number;
  gameType?: string;
  genNum?: number;
  weather?: string;
  winner?: string;
  conditions: ConditionState[];
  sides: Record<SideId, Side>;
};

export type ConditionState = {
  raw: string;
  name: string;
  id: ID;
  setterSideId?: SideId;
  setterPokemon?: string;
  sourceMove?: string;
  singleTurn?: boolean;
};

export type SetterState = {
  raw: string;
  setter?: PokemonKey;
};

export type BoostStat =
  | "atk"
  | "def"
  | "spa"
  | "spd"
  | "spe"
  | "accuracy"
  | "evasion";

export type BoostState = {
  stage: number;
  setter?: PokemonKey;
  sourceEffect?: string;
};

export type Boosts = Record<BoostStat, BoostState>;

export type TurnState = {
  turnNumber: number;
  field: Field;
};

type PokemonRef = {
  sideId: SideId;
  positionId: PositionId;
  nickname: string;
  canonicalKey: string;
};

const BOOST_STATS: readonly BoostStat[] = [
  "atk",
  "def",
  "spa",
  "spd",
  "spe",
  "accuracy",
  "evasion",
];

function defaultBoosts(): Boosts {
  return {
    atk: { stage: 0 },
    def: { stage: 0 },
    spa: { stage: 0 },
    spd: { stage: 0 },
    spe: { stage: 0 },
    accuracy: { stage: 0 },
    evasion: { stage: 0 },
  };
}

function isBoostStat(stat: string | undefined): stat is BoostStat {
  return Boolean(stat) && (BOOST_STATS as string[]).includes(stat as string);
}

function defaultPosition(id: PositionId): Position {
  return {
    id,
    conditions: [],
  };
}

function defaultSide(id: SideId): Side {
  return {
    id,
    stats: {
      switches: 0,
    },
    conditions: [],
    positions: {
      a: defaultPosition("a"),
      b: defaultPosition("b"),
      c: defaultPosition("c"),
    },
    pokemon: {},
  };
}

function defaultField(): Field {
  return {
    turnNumber: 0,
    conditions: [],
    sides: {
      p1: defaultSide("p1"),
      p2: defaultSide("p2"),
      p3: defaultSide("p3"),
      p4: defaultSide("p4"),
    },
  };
}

function cloneState(field: Field): Field {
  return {
    turnNumber: field.turnNumber,
    timestampStart: field.timestampStart,
    timestampEnd: field.timestampEnd,
    gameType: field.gameType,
    genNum: field.genNum,
    weather: field.weather,
    winner: field.winner,
    conditions: field.conditions.map((condition) => ({ ...condition })),
    sides: {
      p1: cloneSide(field.sides.p1),
      p2: cloneSide(field.sides.p2),
      p3: cloneSide(field.sides.p3),
      p4: cloneSide(field.sides.p4),
    },
  };
}

function cloneSide(side: Side): Side {
  const pokemon = Object.fromEntries(
    Object.entries(side.pokemon).map(([key, value]) => [
      key,
      {
        ...value,
        speciesHistory: [...value.speciesHistory],
        detailsHistory: [...value.detailsHistory],
        moveset: [...value.moveset],
        moveHistory: Object.fromEntries(
          Object.entries(value.moveHistory).map(([moveId, history]) => [
            moveId,
            [...history],
          ]),
        ),
        damageHistory: value.damageHistory.map((damageData) => ({
          ...damageData,
        })),
        critHistory: value.critHistory.map((critEvent) => ({
          ...critEvent,
        })),
        missHistory: value.missHistory.map((missEvent) => ({
          ...missEvent,
        })),
        fainted: value.fainted ? { ...value.fainted } : undefined,
        hp: { ...value.hp },
        boosts: Object.fromEntries(
          Object.entries(value.boosts).map(([stat, boostState]) => [
            stat,
            { ...boostState },
          ]),
        ) as Boosts,
        flags: { ...value.flags },
      },
    ]),
  );

  const clonePosition = (position: Position): Position => {
    const pokemonKey = position.pokemon?.key;
    return {
      ...position,
      pokemon: pokemonKey ? pokemon[pokemonKey] : undefined,
      conditions: position.conditions.map((condition) => ({
        ...condition,
      })),
    };
  };

  return {
    id: side.id,
    username: side.username,
    teamSize: side.teamSize,
    stats: { ...side.stats },
    conditions: side.conditions.map((condition) => ({ ...condition })),
    positions: {
      a: clonePosition(side.positions.a),
      b: clonePosition(side.positions.b),
      c: clonePosition(side.positions.c),
    },
    pokemon,
  };
}

function parsePokemonRef(pokemon: string | undefined): PokemonRef | undefined {
  if (!pokemon) return undefined;

  const parsed = pokemon.match(/^p([1-4])([abc])?:\s*(.+)$/);
  if (!parsed) return undefined;

  const [, sideNumber, position, nickname] = parsed;
  if (!sideNumber || !nickname) return undefined;

  const sideId = `p${sideNumber}` as SideId;
  const positionId = (position ?? "a") as PositionId;
  const canonicalNickname = nickname.trim();

  return {
    sideId,
    positionId,
    nickname: canonicalNickname,
    canonicalKey: `${sideId}: ${canonicalNickname}`,
  };
}

function toPositionVictimKey(pokemonRef: PokemonRef): string {
  return `${pokemonRef.sideId}${pokemonRef.positionId}`;
}

function parseSideId(side: string | undefined): SideId | undefined {
  if (!side) return undefined;
  const parsed = side.match(/^(p\d+)/);
  if (!parsed || !parsed[1]) return undefined;
  return parsed[1] as SideId;
}

// Index = move.critRatio (1-6+); value = probability of a crit on that hit.
// Ratio 0/undefined means the move cannot crit at all (callers must guard
// for that separately, since "no chance" and "guaranteed" are both edge
// cases here).
const CRIT_CHANCES = [0, 0.0416667, 0.125, 0.5, 1, 1];

function getMoveCritChance(
  moveId: string,
  genNum?: number,
): number | undefined {
  const gen = gens.get(genNum ?? 9);
  const move = gen.moves.get(moveId);
  if (!move?.exists || !move.critRatio) return undefined;
  if (move.category !== "Physical" && move.category !== "Special") {
    return undefined;
  }
  return move.critRatio > 5 ? 1 : CRIT_CHANCES[move.critRatio];
}

function getMoveAccuracy(moveId: string, genNum?: number): number | undefined {
  const gen = gens.get(genNum ?? 9);
  const move = gen.moves.get(moveId);
  if (!move?.exists) return undefined;
  if (!move.target || move.target === "self") return undefined;
  return move.accuracy === true ? 1 : move.accuracy / 100;
}

// Move.target values that hit more than one position at once. Single-target
// values ("normal", "any", etc.) and non-attacking values ("self") are
// intentionally excluded here, since they're handled by the count===1
// fallback in countMoveTargets.
const SPREAD_MOVE_TARGETS = new Set([
  "allAdjacent",
  "allAdjacentFoes",
  "all",
  "foeSide",
  "allySide",
  "allyTeam",
]);

/**
 * Best-effort count of how many Pokemon a move's targeting hits, used to
 * size the optimistic crit/miss luck queue. For single-target moves this
 * is always 1. For spread moves, it's the number of currently-occupied
 * opposing positions (the common case) - "allySide"/"allyTeam" targets are
 * non-damaging field effects and don't produce per-target damage/miss
 * lines, so they fall back to 1 as well since no luck queue claiming
 * happens for them in practice.
 */
function countMoveTargets(
  moveId: string,
  attacker: Pokemon,
  field: Field,
  genNum?: number,
): number {
  const gen = gens.get(genNum ?? 9);
  const move = gen.moves.get(moveId);
  if (!move?.exists || !move.target) return 1;
  if (!SPREAD_MOVE_TARGETS.has(move.target)) return 1;
  if (move.target === "allySide" || move.target === "allyTeam") return 1;

  if (move.target === "all") {
    return SIDE_IDS.reduce(
      (count, sideId) =>
        count +
        Object.values(field.sides[sideId].positions).filter((position) =>
          Boolean(position.pokemon),
        ).length,
      0,
    );
  }

  // allAdjacent / allAdjacentFoes: count occupied positions on opposing
  // side(s). We don't have exact adjacency (left/right) modeling here, so
  // this counts all occupied foe positions, which is correct for doubles
  // and an overcount only in triples for moves that should skip the
  // non-adjacent corner - an acceptable approximation given replay logs
  // don't expose grid adjacency directly.
  const foeSideIds = SIDE_IDS.filter((sideId) => sideId !== attacker.sideId);
  let count = foeSideIds.reduce(
    (sum, sideId) =>
      sum +
      Object.values(field.sides[sideId].positions).filter((position) =>
        Boolean(position.pokemon),
      ).length,
    0,
  );
  if (move.target === "allAdjacent") {
    count += Object.values(field.sides[attacker.sideId].positions).filter(
      (position) =>
        Boolean(position.pokemon) && position.pokemon?.key !== attacker.key,
    ).length;
  }
  return Math.max(count, 1);
}

function toBaseSpeciesId(speciesId: ID, genNum?: number): ID {
  const gen = gens.get(genNum ?? 9);
  const specie = gen.species.get(speciesId);
  if (!specie?.exists) return speciesId;
  return toID(specie.baseSpecies || specie.name);
}

function parseSpeciesDetails(
  details: string | undefined,
  genNum?: number,
): {
  speciesId?: ID;
  baseSpeciesId?: ID;
  gender?: GenderName;
  shiny?: true;
} {
  if (!details) return {};
  const [species] = details.split(",");
  const speciesId = toID(species?.trim());
  if (!speciesId) return {};

  const metadataTokens = details
    ?.split(",")
    .slice(1)
    .map((token) => token.trim().toLowerCase());
  const gender = metadataTokens?.includes("m")
    ? "M"
    : metadataTokens?.includes("f")
      ? "F"
      : metadataTokens?.includes("n")
        ? "N"
        : undefined;
  const shiny = metadataTokens?.includes("shiny") ? true : undefined;

  return {
    speciesId,
    baseSpeciesId: toBaseSpeciesId(speciesId, genNum),
    gender,
    shiny,
  };
}

function parseHpState(hpRaw: string | undefined): HPState | undefined {
  if (!hpRaw) return undefined;

  const hp = hpRaw.trim();
  const [currentRaw, maxRaw] = hp.split("/");
  const current = Number(currentRaw);
  if (current === 0) return { raw: hp, current: 0, percent: 0 };
  if (!maxRaw) return { raw: hp };

  const max = Number(maxRaw);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
    return { raw: hp };
  }

  return {
    raw: hp,
    current,
    max,
    percent: (current / max) * 100,
  };
}

function parseHpStatus(hpStatus: string | undefined): HPState | undefined {
  if (!hpStatus) return undefined;

  const normalized = hpStatus.trim();
  if (normalized.startsWith("[")) return undefined;

  const [hpRaw, statusRaw] = normalized.split(/\s+/, 2);
  const hp = parseHpState(hpRaw);
  const status = statusRaw?.trim();
  return hp;
}

function upsertPokemon(side: Side, key: string, nickname: string): Pokemon {
  const existing = side.pokemon[key];
  if (existing) return existing;

  const created: Pokemon = {
    key,
    sideId: side.id,
    nickname,
    speciesHistory: [],
    detailsHistory: [],
    moveset: [],
    moveHistory: {},
    damageHistory: [],
    critHistory: [],
    missHistory: [],
    hp: {
      raw: "100/100",
      current: 100,
      max: 100,
      percent: 100,
    },
    boosts: defaultBoosts(),
    flags: {},
  };
  side.pokemon[key] = created;
  return created;
}

function normalizeConditionName(condition: string): string {
  const splitCondition = condition.split(": ");
  if (splitCondition.length === 2 && splitCondition[1]) {
    return splitCondition[1];
  }
  return condition;
}

function conditionVariants(condition: string): Set<string> {
  const normalized = normalizeConditionName(condition);
  return new Set([condition, normalized, toID(condition), toID(normalized)]);
}

function ensureConditionInList(
  values: ConditionState[],
  condition: ConditionState,
): void {
  if (
    values.some(
      (value) =>
        value.id === condition.id &&
        value.setterPokemon === condition.setterPokemon &&
        value.sourceMove === condition.sourceMove,
    )
  ) {
    return;
  }
  values.push(condition);
}

function removeConditionFromList(
  values: ConditionState[],
  condition: string,
): void {
  const variants = conditionVariants(condition);
  const index = values.findIndex(
    (value) =>
      variants.has(value.raw) ||
      variants.has(value.name) ||
      variants.has(value.id),
  );
  if (index >= 0) values.splice(index, 1);
}

function pushUnique(values: string[], value: string | undefined): void {
  if (!value) return;
  if (!values.includes(value)) values.push(value);
}

@Injectable()
export class ReplayStatesService {
  /**
   * Per-move queue of not-yet-claimed optimistic crit/miss luck records,
   * keyed by `${attackerKey}|${moveId}|${turnNumber}`. Populated when a
   * `move` line fires (one entry pair per expected target), then drained
   * FIFO as -damage/-miss/-immune children name their actual target.
   * Reset at the start of every build() call so state never leaks between
   * separate replays processed by this (singleton) service.
   */
  private pendingMoveLuck = new Map<
    string,
    { crit?: CritLuckEvent; miss?: MissLuckEvent }[]
  >();

  /**
   * Set by -crit (which only names the target, not the attacker context
   * needed to claim a queue entry) and consumed by the sibling -damage
   * line for the same attacker/move/turn, which does the actual claim.
   */
  private pendingCrit = new Set<string>();

  private readonly actionFns: Record<
    string,
    (line: ReplayLine, field: Field, parentLine?: ReplayLine) => void
  > = {
    detailschange: (line, field) => this.applyDetailsTransformLike(line, field),
    drag: (line, field) => this.applySwitchLike(line, field),
    faint: (line, field, _parentLine) => {
      const position = this.getPositionFromArgs(line.args.pokemon, field);
      const pokemon = position?.pokemon;
      if (!pokemon) return;
      const lastDamage =
        pokemon.damageHistory[pokemon.damageHistory.length - 1];

      let fainted = {
        turnNumber: line.turnNumber,
        sourceAction: line.action,
        attackerSideId:
          lastDamage?.attackerSideId ?? parseSideId(lastDamage?.attacker),
        attackerPokemon: lastDamage?.attacker,
        move: lastDamage?.move,
        cause: lastDamage?.cause,
        indirect: lastDamage?.indirect,
      };

      if (pokemon.flags.destinyBond) {
        const attacker = this.getPokemonFromArgs(
          pokemon.flags.destinyBond,
          field,
        );
        fainted = {
          turnNumber: line.turnNumber,
          sourceAction: "destinybond",
          attackerSideId: attacker?.sideId,
          attackerPokemon: attacker?.key,
          move: "Destiny Bond",
          cause: "Destiny Bond",
          indirect: true,
        };
      }

      pokemon.fainted = fainted;
      if (pokemon.hp?.max) {
        pokemon.hp = {
          raw: `0/${pokemon.hp.max}`,
          current: 0,
          max: pokemon.hp.max,
          percent: 0,
        };
      }
    },
    player: (line, field) => {
      const sideId = parseSideId(line.args.player);
      if (!sideId || !line.args.username) return;
      field.sides[sideId].username = line.args.username;
    },
    poke: (line, field) => {
      const sideId = parseSideId(line.args.player);
      if (!sideId || !line.args.details) return;
      const { speciesId, baseSpeciesId, gender, shiny } = parseSpeciesDetails(
        line.args.details,
        field.genNum,
      );
      if (!speciesId) return;

      const key = `${sideId}: ${baseSpeciesId ?? speciesId}`;
      const pokemon = upsertPokemon(field.sides[sideId], key, speciesId);
      pokemon.details = line.args.details;
      pushUnique(pokemon.detailsHistory, line.args.details);
      pokemon.species = speciesId;
      pokemon.baseSpecies = baseSpeciesId ?? speciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
      pokemon.gender = gender;
      pokemon.shiny = shiny;
      if (line.args.item)
        pokemon.item = {
          raw: line.args.item,
          setter: pokemon.key,
        };
    },
    gametype: (line, field) => {
      if (line.args.gameType) field.gameType = line.args.gameType;
    },
    gen: (line, field) => {
      const genNum = line.args.genNum ? Number(line.args.genNum) : NaN;
      if (!Number.isFinite(genNum)) return;
      field.genNum = genNum;
    },
    move: (line, field) => {
      const pokemon = this.getPokemonFromArgs(
        line.args.attacker ?? line.args.pokemon,
        field,
      );
      if (!pokemon || !line.args.move) return;
      if (!pokemon.moveset.includes(line.args.move)) {
        pokemon.moveset.push(line.args.move);
      }

      const moveId = toID(line.args.move);
      const history = pokemon.moveHistory[moveId] ?? [];
      history.push({
        turnNumber: line.turnNumber,
        raw: line.args.move,
        target: line.args.target,
      });
      pokemon.moveHistory[moveId] = history;

      this.recordMoveLuck(pokemon, moveId, line, field);
    },
    replace: (line, field) => this.applySwitchLike(line, field),
    switch: (line, field) => {
      const pokemonRef = parsePokemonRef(line.args.pokemon);
      if (pokemonRef) {
        field.sides[pokemonRef.sideId].stats.switches++;
      }
      this.applySwitchLike(line, field);
    },
    "t:": (line, field) => {
      const timestamp = line.args.timestamp ? Number(line.args.timestamp) : NaN;
      if (!Number.isFinite(timestamp)) return;
      if (field.timestampStart === undefined) field.timestampStart = timestamp;
      field.timestampEnd = timestamp;
    },
    teamsize: (line, field) => {
      const sideId = parseSideId(line.args.player);
      const teamSize = line.args.number ? Number(line.args.number) : NaN;
      if (!sideId || !Number.isFinite(teamSize)) return;
      field.sides[sideId].teamSize = teamSize;
    },
    win: (line, field) => {
      if (line.args.winner) field.winner = line.args.winner;
    },
    "-boost": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !isBoostStat(line.args.stat) || !line.args.amount) return;
      const amount = Number(line.args.amount);
      if (!Number.isFinite(amount)) return;
      this.applyBoostDelta(pokemon, line.args.stat, amount, line, field);
    },
    "-unboost": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !isBoostStat(line.args.stat) || !line.args.amount) return;
      const amount = Number(line.args.amount);
      if (!Number.isFinite(amount)) return;
      this.applyBoostDelta(pokemon, line.args.stat, -amount, line, field);
    },
    "-setboost": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !isBoostStat(line.args.stat) || !line.args.amount) return;
      const amount = Number(line.args.amount);
      if (!Number.isFinite(amount)) return;
      const setter = this.resolveBoostSetter(line, field, pokemon);
      pokemon.boosts[line.args.stat] = {
        stage: amount,
        setter: setter?.key,
        sourceEffect: line.args.from,
      };
    },
    "-clearboost": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      pokemon.boosts = defaultBoosts();
    },
    "-clearnegativeboost": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      BOOST_STATS.forEach((stat) => {
        if (pokemon.boosts[stat].stage < 0) {
          pokemon.boosts[stat] = { stage: 0 };
        }
      });
    },
    "-clearpositiveboost": (line, field) => {
      // Protocol: |-clearpositiveboost|TARGET|POKEMON|EFFECT
      // TARGET is the Pokemon whose positive boosts are cleared; POKEMON is
      // the one whose effect caused it (e.g. the Spectral Thief user).
      const target = this.getPokemonFromArgs(line.args.target, field);
      const source = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!target) return;
      BOOST_STATS.forEach((stat) => {
        if (target.boosts[stat].stage > 0) {
          target.boosts[stat] = {
            stage: 0,
            setter: source?.key,
            sourceEffect: line.args.effect,
          };
        }
      });
    },
    "-clearallboost": (line, field) => {
      SIDE_IDS.forEach((sideId) => {
        Object.values(field.sides[sideId].pokemon).forEach((pokemon) => {
          pokemon.boosts = defaultBoosts();
        });
      });
    },
    "-copyboost": (line, field) => {
      const source = this.getPokemonFromArgs(line.args.source, field);
      const target = this.getPokemonFromArgs(line.args.target, field);
      if (!source || !target) return;
      BOOST_STATS.forEach((stat) => {
        target.boosts[stat] = {
          stage: source.boosts[stat].stage,
          setter: source.key,
          sourceEffect: line.args.from,
        };
      });
    },
    "-swapboost": (line, field) => {
      const source = this.getPokemonFromArgs(line.args.source, field);
      const target = this.getPokemonFromArgs(line.args.target, field);
      if (!source || !target || !line.args.stats) return;
      const stats = line.args.stats
        .split(",")
        .map((stat) => stat.trim())
        .filter(isBoostStat);
      stats.forEach((stat) => {
        const sourceBoost = { ...source.boosts[stat] };
        const targetBoost = { ...target.boosts[stat] };
        source.boosts[stat] = targetBoost;
        target.boosts[stat] = sourceBoost;
      });
    },
    "-invertboost": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      BOOST_STATS.forEach((stat) => {
        pokemon.boosts[stat] = {
          ...pokemon.boosts[stat],
          stage: -pokemon.boosts[stat].stage,
        };
      });
    },
    "-immune": (line, field, parentLine) => {
      // An immune target still resolves the accuracy roll (the move
      // connected, it just had no effect) but can never crit. Claim the
      // queue entry so it doesn't leak into a later target's outcome.
      if (!parentLine || parentLine.action !== "move" || !parentLine.args.move)
        return;
      const attacker = this.getPokemonFromArgs(
        parentLine.args.attacker ?? parentLine.args.pokemon,
        field,
      );
      const target = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!attacker) return;
      const moveId = toID(parentLine.args.move);
      const claimed = this.claimMoveLuckEntry(
        attacker.key,
        moveId,
        line.turnNumber,
      );
      if (claimed?.miss) {
        claimed.miss.target = target?.key ?? claimed.miss.target;
        claimed.miss.hit = true;
      }
      if (claimed?.crit) {
        claimed.crit.target = target?.key ?? claimed.crit.target;
        claimed.crit.hit = false;
      }
      this.consumePendingCrit(attacker.key, moveId, line.turnNumber);
    },
    "-miss": (line, field, parentLine) => {
      const attacker = this.getPokemonFromArgs(line.args.source, field);
      const target = this.getPokemonFromArgs(line.args.target, field);
      if (!attacker) return;

      const moveId =
        parentLine?.action === "move" && parentLine.args.move
          ? toID(parentLine.args.move)
          : undefined;
      const claimed = moveId
        ? this.claimMoveLuckEntry(attacker.key, moveId, line.turnNumber)
        : undefined;

      if (claimed?.miss) {
        claimed.miss.target = target?.key ?? claimed.miss.target;
        claimed.miss.hit = false;
      }
      // A missed move can't crit; consume any pending crit flag so it
      // doesn't incorrectly carry over to a later hit this same turn.
      if (moveId)
        this.consumePendingCrit(attacker.key, moveId, line.turnNumber);
    },
    "-ability": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !line.args.ability) return;
      pokemon.ability = line.args.ability;
    },
    "-activate": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      const effectName = line.args.effect?.replace(/^move:\s*/i, "");
      if (effectName === "Destiny Bond") {
        const lastDamage =
          pokemon.damageHistory[pokemon.damageHistory.length - 1];
        const attackerKey = lastDamage?.attacker;
        const attacker = this.getPokemonFromArgs(attackerKey, field);
        if (attacker) attacker.flags.destinyBond = pokemon.key;
      }
    },
    "-crit": (line, field, parentLine) => {
      // -crit's own arg is the target being hit; the attacker only appears
      // on the parent move line. -crit always precedes its sibling
      // -damage line for the same target, so rather than claiming a luck
      // queue entry here, we set a flag that the next -damage claim for
      // this attacker/move/turn will consume to mark that hit as a crit.
      if (!parentLine || parentLine.action !== "move") return;
      const attacker = this.getPokemonFromArgs(
        parentLine.args.attacker ?? parentLine.args.pokemon,
        field,
      );
      if (!attacker || !parentLine.args.move) return;
      const moveId = toID(parentLine.args.move);
      this.setPendingCrit(attacker.key, moveId, line.turnNumber);
    },
    "-curestatus": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      pokemon.status = {
        raw: "healthy",
      };
    },
    "-damage": (line, field, parentLine) => {
      const damaged = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!damaged) return;

      if (line.args.from) {
        console.log(line.args.from);
      }
      const source = line.args.from
        ? this.findConditionSource(field, damaged.sideId, line.args.from)
        : undefined;
      const target = this.getPokemonFromArgs(parentLine?.args.target, field);
      const attackerRef =
        source?.setterPokemon ??
        parentLine?.args.attacker ??
        parentLine?.args.pokemon ??
        line.args.of;
      const attacker = this.getPokemonFromArgs(attackerRef, field);

      const indirect = target !== damaged || Boolean(source || line.args.from);

      const hp = parseHpStatus(line.args.hpStatus);

      const hpDelta =
        hp?.current !== undefined && damaged.hp?.current !== undefined
          ? damaged.hp.current - hp.current
          : undefined;

      const damageContext: DamageData = {
        turnNumber: line.turnNumber,
        damageTaken: hpDelta ?? 0,
        hpBefore: damaged.hp.current ?? 100,
        hpAfter: hp?.current ?? 100,
        indirect,
        move: parentLine?.args.move ?? source?.sourceMove ?? line.args.from,
        cause: source?.name ?? line.args.from ?? parentLine?.action,
        attacker: attacker?.key,
        attackerSideId: attacker?.sideId ?? source?.setterSideId,
      };

      this.applyHpStatus(damaged, line.args.hpStatus, damageContext);

      // A direct move hit claims one entry from the attacker's pending
      // crit/miss luck queue for this move - "this target took the hit"
      // resolves both the accuracy check (it landed) and the crit check
      // (confirmed or not, via the pending crit flag -crit may have set).
      if (parentLine?.action === "move" && attacker && parentLine.args.move) {
        const moveId = toID(parentLine.args.move);
        const claimed = this.claimMoveLuckEntry(
          attacker.key,
          moveId,
          line.turnNumber,
        );
        if (claimed?.crit) {
          claimed.crit.target = damaged.key;
          claimed.crit.hit = this.consumePendingCrit(
            attacker.key,
            moveId,
            line.turnNumber,
          );
        }
        if (claimed?.miss) {
          claimed.miss.target = damaged.key;
          claimed.miss.hit = true;
        }
      }
    },
    "-endability": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      pokemon.ability = undefined;
    },
    "-enditem": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      pokemon.item = undefined;
    },
    "-fieldend": (line, field) => {
      if (!line.args.condition) return;
      removeConditionFromList(field.conditions, line.args.condition);
    },
    "-fieldstart": (line, field, parentLine) => {
      if (!line.args.condition) return;
      ensureConditionInList(
        field.conditions,
        this.createConditionState(
          line.args.condition,
          field,
          parentLine,
          line.turnNumber,
        ),
      );
    },
    "-formechange": (line, field) =>
      this.applyDetailsTransformLike(line, field),
    "-heal": (line, field, parentLine) => {
      const position = this.getPositionFromArgs(line.args.pokemon, field);
      const pokemon = position?.pokemon;
      if (!pokemon) return;
      this.applyHpStatus(pokemon, line.args.hpStatus);
    },
    "-item": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !line.args.item) return;
      pokemon.item = {
        raw: line.args.item,
      };
    },
    "-sethp": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !line.args.hp) return;
      const parsedHp = parseHpState(line.args.hp);
      if (parsedHp) {
        pokemon.hp = {
          ...pokemon.hp,
          ...parsedHp,
        };
      }
    },
    "-sideend": (line, field) => {
      const sideId = parseSideId(line.args.side);
      if (!sideId || !line.args.condition) return;
      removeConditionFromList(
        field.sides[sideId].conditions,
        line.args.condition,
      );
    },
    "-sidestart": (line, field, parentLine) => {
      const sideId = parseSideId(line.args.side);
      if (!sideId || !line.args.condition) return;
      ensureConditionInList(
        field.sides[sideId].conditions,
        this.createConditionState(
          line.args.condition,
          field,
          parentLine,
          line.turnNumber,
        ),
      );
    },
    "-singlemove": (line, field, parentLine) =>
      this.applySingleTurnCondition(line, field, parentLine),
    "-singleturn": (line, field, parentLine) =>
      this.applySingleTurnCondition(line, field, parentLine),
    "-status": (line, field, parentLine) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !line.args.status) return;
      pokemon.status = {
        raw: line.args.status,
        setter: this.getPokemonFromArgs(line.args.pokemon, field)?.key,
      };
    },
    "-transform": (line, field) => this.applyDetailsTransformLike(line, field),
    "-terastallize": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !line.args.type) return;
      pokemon.teraType = line.args.type;
    },
    "-weather": (line, field) => {
      field.weather =
        line.args.weather && line.args.weather !== "none"
          ? line.args.weather
          : undefined;
    },
  };

  build(parsedLogs: ParsedReplayLog): TurnState[] {
    this.pendingMoveLuck = new Map();
    this.pendingCrit = new Set();
    const { turns } = parsedLogs;
    const field = defaultField();

    return turns.map((turn) => {
      field.turnNumber = turn.number;

      turn.lines.forEach((line) => {
        this.actionFns[line.action]?.(line, field);
        line.children?.forEach((child) => {
          this.actionFns[child.action]?.(child, field, line);
        });
      });

      const turnState: TurnState = {
        turnNumber: turn.number,
        field: cloneState(field),
      };
      SIDE_IDS.forEach((sideId) => {
        POSITION_IDS.forEach((positionId) => {
          field.sides[sideId].positions[positionId].conditions = field.sides[
            sideId
          ].positions[positionId].conditions.filter(
            (condition) => !condition.singleTurn,
          );
        });
        Object.values(field.sides[sideId].pokemon).forEach((pokemon) => {
          delete pokemon.flags.destinyBond;
        });
      });
      return turnState;
    });
  }

  private createConditionState(
    condition: string,
    field: Field,
    parentLine?: ReplayLine,
    turnNumber?: number,
    singleTurn?: boolean,
  ): ConditionState {
    const name = normalizeConditionName(condition);
    const sourceMove =
      parentLine?.action === "move"
        ? parentLine.args.move
        : condition.startsWith("move: ")
          ? name
          : undefined;
    const setterPokemonRef =
      parentLine?.action === "move"
        ? (parentLine.args.attacker ?? parentLine.args.pokemon)
        : undefined;
    const setterPokemon =
      this.getPokemonFromArgs(setterPokemonRef, field) ??
      this.findMoveUser(field, sourceMove, turnNumber);
    const setterSideId = setterPokemon?.sideId;
    return {
      raw: condition,
      name,
      id: toID(name),
      setterSideId,
      setterPokemon: setterPokemon?.key,
      sourceMove,
      singleTurn,
    };
  }

  private findMoveUser(
    field: Field,
    move: string | undefined,
    turnNumber: number | undefined,
  ): Pokemon | undefined {
    if (!move || turnNumber === undefined) return undefined;

    const moveId = toID(move);
    for (const sideId of SIDE_IDS) {
      const side = field.sides[sideId];
      const activePokemon = Object.values(side.positions)
        .map((position) => position.pokemon)
        .filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
      const activeMoveUser = activePokemon.find((pokemon) =>
        (pokemon.moveHistory[moveId] ?? []).some(
          (history) => history.turnNumber === turnNumber,
        ),
      );
      if (activeMoveUser) return activeMoveUser;

      const teamMoveUser = Object.values(side.pokemon).find((pokemon) =>
        (pokemon.moveHistory[moveId] ?? []).some(
          (history) => history.turnNumber === turnNumber,
        ),
      );
      if (teamMoveUser) return teamMoveUser;
    }

    return undefined;
  }

  private applySingleTurnCondition(
    line: ReplayLine,
    field: Field,
    parentLine?: ReplayLine,
  ): void {
    const sideId = parseSideId(line.args.pokemon);
    if (!sideId || !line.args.move) return;

    const positionId = parsePokemonRef(line.args.pokemon)?.positionId;
    if (!positionId) return;

    const position = field.sides[sideId].positions[positionId];
    if (!position) return;

    const condition = this.createConditionState(
      line.args.move,
      field,
      parentLine,
      line.turnNumber,
      true,
    );
    position.conditions.push(condition);
  }

  private findConditionSource(
    field: Field,
    victimSideId: SideId,
    cause: string,
  ): ConditionState | undefined {
    const variants = conditionVariants(cause);
    const victimSide = field.sides[victimSideId];

    const sideCondition = victimSide.conditions.find(
      (condition) =>
        variants.has(condition.raw) ||
        variants.has(condition.name) ||
        variants.has(condition.id),
    );
    if (sideCondition) return sideCondition;

    const fieldCondition = field.conditions.find(
      (condition) =>
        variants.has(condition.raw) ||
        variants.has(condition.name) ||
        variants.has(condition.id),
    );
    if (fieldCondition) return fieldCondition;

    return undefined;
  }

  private applyBoostDelta(
    pokemon: Pokemon,
    stat: BoostStat,
    delta: number,
    line: ReplayLine,
    field: Field,
  ): void {
    const setter = this.resolveBoostSetter(line, field, pokemon);
    const current = pokemon.boosts[stat].stage;
    // Showdown's AMOUNT already reflects the applied delta (e.g. boosting
    // past +6 sends a truncated amount), so this clamp is a defensive
    // safety net rather than primary clamping logic.
    const nextStage = Math.max(-6, Math.min(6, current + delta));
    pokemon.boosts[stat] = {
      stage: nextStage,
      setter: setter?.key,
      sourceEffect: line.args.from,
    };
  }

  private resolveBoostSetter(
    line: ReplayLine,
    field: Field,
    boostedPokemon: Pokemon,
  ): Pokemon | undefined {
    // [of] explicitly names the setter (e.g. Intimidate: [from] ability:
    // Intimidate|[of] p1a: Gyarados). Fall back to the boosted Pokemon
    // itself for self-inflicted boosts (Swords Dance, Dragon Dance, etc).
    const ofPokemon = this.getPokemonFromArgs(line.args.of, field);
    if (ofPokemon) return ofPokemon;
    if (line.args.from) return boostedPokemon;
    return undefined;
  }

  /**
   * Records the expected crit/accuracy probability for a single move-use,
   * optimistically assuming the move both hits and doesn't crit. The
   * "-miss" and "-crit" handlers correct the `hit` flag on these records
   * once the actual outcome is known. This mirrors v1's
   * recordMoveUsageLuck, but as per-event history rather than running
   * counters, so expected-vs-actual can be aggregated however the
   * analysis layer wants later (overall, per-move, per-turn, etc).
   */
  /**
   * Records expected crit/accuracy probability for a move-use, one entry
   * per expected target (singles: always 1; spread moves: one per
   * currently-occupied target position). Each entry optimistically
   * assumes a hit / no-crit. The pushed entries are also queued so that
   * per-target outcome lines (-damage/-miss/-immune/-crit) that follow as
   * children of this move can claim and correct one entry each, rather
   * than all targets sharing a single record.
   */
  private recordMoveLuck(
    pokemon: Pokemon,
    moveId: string,
    line: ReplayLine,
    field: Field,
  ): void {
    if (!line.args.move) return;

    const targetCount = countMoveTargets(moveId, pokemon, field, field.genNum);
    const accuracyExpected = getMoveAccuracy(moveId, field.genNum);
    const critExpected = getMoveCritChance(moveId, field.genNum);
    if (accuracyExpected === undefined && critExpected === undefined) return;

    const queueKey = this.moveLuckQueueKey(
      pokemon.key,
      moveId,
      line.turnNumber,
    );
    const queue: { crit?: CritLuckEvent; miss?: MissLuckEvent }[] = [];

    for (let i = 0; i < targetCount; i++) {
      const entry: { crit?: CritLuckEvent; miss?: MissLuckEvent } = {};

      if (accuracyExpected !== undefined) {
        const missEvent: MissLuckEvent = {
          turnNumber: line.turnNumber,
          move: line.args.move,
          target: line.args.target,
          expected: accuracyExpected,
          hit: true,
        };
        pokemon.missHistory.push(missEvent);
        entry.miss = missEvent;
      }

      if (critExpected !== undefined) {
        const critEvent: CritLuckEvent = {
          turnNumber: line.turnNumber,
          move: line.args.move,
          target: line.args.target,
          expected: critExpected,
          hit: false,
        };
        pokemon.critHistory.push(critEvent);
        entry.crit = critEvent;
      }

      queue.push(entry);
    }

    this.pendingMoveLuck.set(queueKey, queue);
  }

  private moveLuckQueueKey(
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): string {
    return `${attackerKey}|${moveId}|${turnNumber}`;
  }

  /**
   * Claims the next unclaimed optimistic luck entry for an attacker's
   * move this turn, so a -damage/-miss/-immune child line can attribute
   * its outcome to a specific target rather than leaving every target on
   * a move sharing one record. Returns undefined if there's no pending
   * entry (e.g. the action isn't a child of a tracked move).
   */
  private claimMoveLuckEntry(
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): { crit?: CritLuckEvent; miss?: MissLuckEvent } | undefined {
    const queueKey = this.moveLuckQueueKey(attackerKey, moveId, turnNumber);
    const queue = this.pendingMoveLuck.get(queueKey);
    if (!queue || queue.length === 0) return undefined;
    return queue.shift();
  }

  private setPendingCrit(
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): void {
    this.pendingCrit.add(
      this.moveLuckQueueKey(attackerKey, moveId, turnNumber),
    );
  }

  /**
   * Returns whether a -crit was flagged for this attacker/move/turn and
   * clears the flag either way, so it can't leak into a later hit. Safe
   * to call even when no -crit was seen (returns false).
   */
  private consumePendingCrit(
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): boolean {
    const key = this.moveLuckQueueKey(attackerKey, moveId, turnNumber);
    const wasPending = this.pendingCrit.has(key);
    this.pendingCrit.delete(key);
    return wasPending;
  }

  private getPokemonFromArgs(
    pokemonRefRaw: string | undefined,
    field: Field,
  ): Pokemon | undefined {
    if (!pokemonRefRaw) return undefined;

    const sideId = parseSideId(pokemonRefRaw);
    if (sideId && field.sides[sideId].pokemon[pokemonRefRaw]) {
      return field.sides[sideId].pokemon[pokemonRefRaw];
    }

    const pokemonRef = parsePokemonRef(pokemonRefRaw);
    if (!pokemonRef) return undefined;
    return this.resolvePokemonByRef(pokemonRef, field);
  }

  private getPositionFromArgs(
    pokemonRefRaw: string | undefined,
    field: Field,
  ): Position | undefined {
    if (!pokemonRefRaw) return undefined;

    const pokemonRef = parsePokemonRef(pokemonRefRaw);
    if (pokemonRef) {
      return field.sides[pokemonRef.sideId].positions[pokemonRef.positionId];
    }

    const sideId = parseSideId(pokemonRefRaw);
    if (!sideId) return undefined;

    const side = field.sides[sideId];
    const byKey = Object.values(side.positions).find(
      (position) => position.pokemon?.key === pokemonRefRaw,
    );
    return byKey;
  }

  private applySwitchLike(line: ReplayLine, field: Field): void {
    const pokemonRef = parsePokemonRef(line.args.pokemon);
    if (!pokemonRef) return;

    const side = field.sides[pokemonRef.sideId];
    const { speciesId, baseSpeciesId, gender, shiny } = parseSpeciesDetails(
      line.args.details,
      field.genNum,
    );
    const speciesKey = speciesId
      ? `${pokemonRef.sideId}: ${speciesId}`
      : undefined;
    const baseSpeciesKey = baseSpeciesId
      ? `${pokemonRef.sideId}: ${baseSpeciesId}`
      : undefined;
    const nicknameMatch = Object.values(side.pokemon).find(
      (pokemon) => pokemon.nickname === pokemonRef.nickname,
    );
    const pokemonKey = side.pokemon[pokemonRef.canonicalKey]
      ? pokemonRef.canonicalKey
      : nicknameMatch
        ? nicknameMatch.key
        : baseSpeciesKey && side.pokemon[baseSpeciesKey]
          ? baseSpeciesKey
          : speciesKey && side.pokemon[speciesKey]
            ? speciesKey
            : (baseSpeciesKey ?? speciesKey ?? pokemonRef.canonicalKey);

    const pokemon = upsertPokemon(side, pokemonKey, pokemonRef.nickname);
    pokemon.nickname = pokemonRef.nickname;
    if (speciesId) pokemon.species = speciesId;
    if (baseSpeciesId) pokemon.baseSpecies = baseSpeciesId;
    pushUnique(pokemon.speciesHistory, speciesId);
    pokemon.gender = gender;
    pokemon.shiny = shiny;
    if (line.args.details) pokemon.details = line.args.details;
    pushUnique(pokemon.detailsHistory, line.args.details);

    const hp = parseHpStatus(line.args.hpStatus);
    if (hp) pokemon.hp = hp;

    side.positions[pokemonRef.positionId].pokemon = pokemon;
  }

  private resolvePokemonByRef(
    pokemonRef: PokemonRef,
    field: Field,
  ): Pokemon | undefined {
    const side = field.sides[pokemonRef.sideId];

    const activePokemon = side.positions[pokemonRef.positionId].pokemon;
    if (activePokemon) return activePokemon;

    const direct = side.pokemon[pokemonRef.canonicalKey];
    if (direct) return direct;

    return Object.values(side.pokemon).find(
      (pokemon) => pokemon.nickname === pokemonRef.nickname,
    );
  }

  private applyHpStatus(
    pokemon?: Pokemon,
    hpStatus?: HPSTATUS | HP,
    damageContext?: DamageData,
  ): void {
    if (!pokemon || !hpStatus) return;
    const previousPercent =
      typeof pokemon.hp?.percent === "number" ? pokemon.hp.percent : undefined;
    const hp = parseHpStatus(hpStatus);
    hp;
    if (hp)
      pokemon.hp = {
        ...pokemon.hp,
        ...hp,
      };

    const nextPercent = hp?.percent;
    const hpDelta =
      previousPercent !== undefined && nextPercent !== undefined
        ? previousPercent - nextPercent
        : undefined;
    if (hpDelta === undefined) return;
    if (hpDelta > 0) {
      this.applyDamage(pokemon, damageContext);
    } else if (hpDelta < 0) {
      this.applyHealing(pokemon);
    }
  }

  private applyDamage(damaged: Pokemon, damageContext?: DamageData): void {
    if (damageContext) damaged.damageHistory.push(damageContext);
  }

  private applyHealing(healed: Pokemon): void {
    healed.fainted = undefined;
  }

  private applyDetailsTransformLike(line: ReplayLine, field: Field): void {
    const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
    if (!pokemon) return;

    if (line.args.details) {
      pokemon.details = line.args.details;
      pushUnique(pokemon.detailsHistory, line.args.details);
      const { speciesId, baseSpeciesId, gender, shiny } = parseSpeciesDetails(
        line.args.details,
        field.genNum,
      );
      if (speciesId) pokemon.species = speciesId;
      if (baseSpeciesId) pokemon.baseSpecies = baseSpeciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
      pokemon.gender = gender;
      pokemon.shiny = shiny;
    }
    if (line.args.species) {
      const speciesId = toID(line.args.species);
      const baseSpeciesId = toBaseSpeciesId(speciesId, field.genNum);
      pokemon.species = speciesId;
      pokemon.baseSpecies = baseSpeciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
    }
    if (line.args.hpStatus) {
      const hp = parseHpStatus(line.args.hpStatus);
      if (hp) pokemon.hp = hp;
    }
  }
}
