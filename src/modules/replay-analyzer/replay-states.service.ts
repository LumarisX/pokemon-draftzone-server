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

export type HealData = {
  turnNumber: number;
  amount: number;
  source?: string;
};

export type CritLuckEvent = {
  turnNumber: number;
  move: string;
  target?: string;
  expected: number;
  hit: boolean;
};

export type MissLuckEvent = {
  turnNumber: number;
  move: string;
  target?: string;
  expected: number;
  hit: boolean;
};

export type StatusLuckEvent = {
  turnNumber: number;
  expected: number;
  fullyParalyzed: boolean;
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

export type PokemonKey = string;

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
  healHistory: HealData[];
  critHistory: CritLuckEvent[];
  missHistory: MissLuckEvent[];
  fullParalysisHistory: StatusLuckEvent[];
  faints: FaintState[];
  details?: string;
  hp: HPState;
  status?: SetterState;
  fainted?: FaintState;
  item?: SetterState;
  ability?: string;
  teraType?: string;
  shiny?: true;
  gender?: GenderName;
  everActive?: boolean;
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
  weather?: ConditionState;
  winner?: string;
  tie?: boolean;
  conditions: ConditionState[];
  messages: { turnNumber: number; message: string }[];
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

export type TurnSnapshot = {
  turnNumber: number;
  sides: Record<
    SideId,
    Record<PokemonKey, { hpPercent: number; fainted: boolean }>
  >;
};

export type BuildWarning = {
  lineId: string;
  action: string;
  message: string;
};

export type ReplayBuildResult = {
  field: Field;
  turns: TurnSnapshot[];
  warnings: BuildWarning[];
};

type BuildContext = {
  field: Field;

  pendingMoveLuck: Map<
    string,
    { crit?: CritLuckEvent; miss?: MissLuckEvent }[]
  >;

  pendingCrit: Map<string, number>;

  lastEndedCondition?: {
    condition: ConditionState;
    pokemonKey?: PokemonKey;
    turnNumber: number;
  };
  lastMove?: {
    attackerKey: PokemonKey;
    moveId: string;
    moveRaw: string;
    turnNumber: number;
  };
  lineSeq: number;

  lastAbilityActivation?: {
    pokemonKey: PokemonKey;
    lineSeq: number;
  };
  warnings: BuildWarning[];
};

type ActionHandler = (
  line: ReplayLine,
  ctx: BuildContext,
  parentLine?: ReplayLine,
) => void;

type PokemonRef = {
  sideId: SideId;
  positionId: PositionId;
  hasPosition: boolean;
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

const FULL_PARALYSIS_CHANCE = 0.25;

const STATUS_DAMAGE_IDS = new Set(["psn", "tox", "brn"]);

const DELAYED_DAMAGE_EFFECTS = new Set([
  "move: Future Sight",
  "move: Doom Desire",
]);

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
    messages: [],
    sides: {
      p1: defaultSide("p1"),
      p2: defaultSide("p2"),
      p3: defaultSide("p3"),
      p4: defaultSide("p4"),
    },
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
    hasPosition: Boolean(position),
    nickname: canonicalNickname,
    canonicalKey: `${sideId}: ${canonicalNickname}`,
  };
}

function parseSideId(side: string | undefined): SideId | undefined {
  if (!side) return undefined;
  const parsed = side.match(/^(p\d+)/);
  if (!parsed || !parsed[1]) return undefined;
  return parsed[1] as SideId;
}

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

const SPREAD_MOVE_TARGETS = new Set([
  "allAdjacent",
  "allAdjacentFoes",
  "all",
  "foeSide",
  "allySide",
  "allyTeam",
]);

function isTargetablePosition(position: Position): boolean {
  return Boolean(position.pokemon && !position.pokemon.fainted);
}

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
        Object.values(field.sides[sideId].positions).filter(
          isTargetablePosition,
        ).length,
      0,
    );
  }

  const foeSideIds = SIDE_IDS.filter((sideId) => sideId !== attacker.sideId);
  let count = foeSideIds.reduce(
    (sum, sideId) =>
      sum +
      Object.values(field.sides[sideId].positions).filter(isTargetablePosition)
        .length,
    0,
  );
  if (move.target === "allAdjacent") {
    count += Object.values(field.sides[attacker.sideId].positions).filter(
      (position) =>
        isTargetablePosition(position) &&
        position.pokemon?.key !== attacker.key,
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

  const [hpRaw] = normalized.split(/\s+/, 2);
  return parseHpState(hpRaw);
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
    healHistory: [],
    critHistory: [],
    missHistory: [],
    fullParalysisHistory: [],
    faints: [],
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

function conditionMatcher(
  condition: string,
): (value: ConditionState) => boolean {
  const variants = conditionVariants(condition);
  return (value) =>
    variants.has(value.raw) ||
    variants.has(value.name) ||
    variants.has(value.id);
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
): ConditionState | undefined {
  const index = values.findIndex(conditionMatcher(condition));
  if (index >= 0) return values.splice(index, 1)[0];
  return undefined;
}

function pushUnique(values: string[], value: string | undefined): void {
  if (!value) return;
  if (!values.includes(value)) values.push(value);
}

function getHpPercent(pokemon: Pokemon): number {
  if (typeof pokemon.hp?.percent === "number") return pokemon.hp.percent;
  return pokemon.fainted ? 0 : 100;
}

function snapshotTurn(field: Field, turnNumber: number): TurnSnapshot {
  const sides = {} as TurnSnapshot["sides"];
  SIDE_IDS.forEach((sideId) => {
    sides[sideId] = Object.fromEntries(
      Object.values(field.sides[sideId].pokemon).map((pokemon) => [
        pokemon.key,
        {
          hpPercent: getHpPercent(pokemon),
          fainted: Boolean(pokemon.fainted),
        },
      ]),
    );
  });
  return { turnNumber, sides };
}

function isDelayedDamageEffect(effect: string | undefined): boolean {
  return Boolean(effect && DELAYED_DAMAGE_EFFECTS.has(effect));
}

const STATUS_DISPLAY_NAMES: Record<string, string> = {
  psn: "Poison",
  tox: "Toxic",
  brn: "Burn",
  par: "Paralysis",
  frz: "Freeze",
  slp: "Sleep",
};

function prettifyCause(
  cause: string | undefined,
  genNum?: number,
): string | undefined {
  if (!cause) return undefined;
  const name = normalizeConditionName(cause);
  const statusName = STATUS_DISPLAY_NAMES[toID(name)];
  if (statusName) return statusName;
  const move = gens.get(genNum ?? 9).moves.get(toID(name));
  if (move?.exists) return move.name;
  return name;
}

@Injectable()
export class ReplayStatesService {
  private readonly actionFns: Record<string, ActionHandler> = {
    detailschange: (line, ctx) =>
      this.applyDetailsTransformLike(line, ctx.field),
    drag: (line, ctx) => this.applySwitchLike(line, ctx.field),
    faint: (line, ctx) => {
      const field = ctx.field;
      const position = this.getPositionFromArgs(line.args.pokemon, field);
      const pokemon =
        position?.pokemon ?? this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;

      const fainted = this.resolveFaintContext(line, ctx, pokemon, position);
      pokemon.fainted = fainted;
      pokemon.faints.push(fainted);
      if (pokemon.hp?.max) {
        pokemon.hp = {
          raw: `0/${pokemon.hp.max}`,
          current: 0,
          max: pokemon.hp.max,
          percent: 0,
        };
      }
    },
    player: (line, ctx) => {
      const sideId = parseSideId(line.args.player);
      if (!sideId || !line.args.username) return;
      ctx.field.sides[sideId].username = line.args.username;
    },
    poke: (line, ctx) => {
      const field = ctx.field;
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
    gametype: (line, ctx) => {
      if (line.args.gameType) ctx.field.gameType = line.args.gameType;
    },
    gen: (line, ctx) => {
      const genNum = line.args.genNum ? Number(line.args.genNum) : NaN;
      if (!Number.isFinite(genNum)) return;
      ctx.field.genNum = genNum;
    },
    message: (line, ctx) => {
      if (!line.args.message) return;
      ctx.field.messages.push({
        turnNumber: line.turnNumber,
        message: line.args.message,
      });
    },
    "-message": (line, ctx) => {
      if (!line.args.message) return;
      ctx.field.messages.push({
        turnNumber: line.turnNumber,
        message: line.args.message,
      });
    },
    move: (line, ctx) => {
      const field = ctx.field;
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

      ctx.lastMove = {
        attackerKey: pokemon.key,
        moveId,
        moveRaw: line.args.move,
        turnNumber: line.turnNumber,
      };

      if (pokemon.status?.raw === "par") {
        pokemon.fullParalysisHistory.push({
          turnNumber: line.turnNumber,
          expected: FULL_PARALYSIS_CHANCE,
          fullyParalyzed: false,
        });
      }

      this.recordMoveLuck(pokemon, moveId, line, ctx);
    },
    cant: (line, ctx) => {
      if (line.args.reason !== "par") return;
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      pokemon?.fullParalysisHistory.push({
        turnNumber: line.turnNumber,
        expected: FULL_PARALYSIS_CHANCE,
        fullyParalyzed: true,
      });
    },
    replace: (line, ctx) =>
      this.applySwitchLike(line, ctx.field, { clearVolatiles: false }),
    switch: (line, ctx) => {
      const pokemonRef = parsePokemonRef(line.args.pokemon);
      if (pokemonRef) {
        ctx.field.sides[pokemonRef.sideId].stats.switches++;
      }
      this.applySwitchLike(line, ctx.field);
    },
    swap: (line, ctx) => {
      const pokemonRef = parsePokemonRef(line.args.pokemon);
      const positionIndex = Number(line.args.position);
      const targetPositionId = POSITION_IDS[positionIndex];
      if (!pokemonRef || !targetPositionId) return;
      if (targetPositionId === pokemonRef.positionId) return;

      const side = ctx.field.sides[pokemonRef.sideId];
      const from = side.positions[pokemonRef.positionId];
      const to = side.positions[targetPositionId];
      side.positions[pokemonRef.positionId] = {
        ...to,
        id: pokemonRef.positionId,
      };
      side.positions[targetPositionId] = { ...from, id: targetPositionId };
    },
    "t:": (line, ctx) => {
      const field = ctx.field;
      const timestamp = line.args.timestamp ? Number(line.args.timestamp) : NaN;
      if (!Number.isFinite(timestamp)) return;
      if (field.timestampStart === undefined) field.timestampStart = timestamp;
      field.timestampEnd = timestamp;
    },
    teamsize: (line, ctx) => {
      const sideId = parseSideId(line.args.player);
      const teamSize = line.args.number ? Number(line.args.number) : NaN;
      if (!sideId || !Number.isFinite(teamSize)) return;
      ctx.field.sides[sideId].teamSize = teamSize;
    },
    win: (line, ctx) => {
      if (line.args.winner) ctx.field.winner = line.args.winner;
    },
    tie: (line, ctx) => {
      ctx.field.tie = true;
    },
    "-boost": (line, ctx) => {
      const field = ctx.field;
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !isBoostStat(line.args.stat) || !line.args.amount) return;
      const amount = Number(line.args.amount);
      if (!Number.isFinite(amount)) return;
      this.applyBoostDelta(pokemon, line.args.stat, amount, line, field);
    },
    "-unboost": (line, ctx) => {
      const field = ctx.field;
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !isBoostStat(line.args.stat) || !line.args.amount) return;
      const amount = Number(line.args.amount);
      if (!Number.isFinite(amount)) return;
      this.applyBoostDelta(pokemon, line.args.stat, -amount, line, field);
    },
    "-setboost": (line, ctx) => {
      const field = ctx.field;
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
    "-clearboost": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon) return;
      pokemon.boosts = defaultBoosts();
    },
    "-clearnegativeboost": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon) return;
      BOOST_STATS.forEach((stat) => {
        if (pokemon.boosts[stat].stage < 0) {
          pokemon.boosts[stat] = { stage: 0 };
        }
      });
    },
    "-clearpositiveboost": (line, ctx) => {
      const field = ctx.field;
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
    "-clearallboost": (line, ctx) => {
      SIDE_IDS.forEach((sideId) => {
        Object.values(ctx.field.sides[sideId].pokemon).forEach((pokemon) => {
          pokemon.boosts = defaultBoosts();
        });
      });
    },
    "-copyboost": (line, ctx) => {
      const field = ctx.field;
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
    "-swapboost": (line, ctx) => {
      const field = ctx.field;
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
    "-invertboost": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon) return;
      BOOST_STATS.forEach((stat) => {
        pokemon.boosts[stat] = {
          ...pokemon.boosts[stat],
          stage: -pokemon.boosts[stat].stage,
        };
      });
    },
    "-immune": (line, ctx, parentLine) => {
      const field = ctx.field;
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
        ctx,
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
      this.consumePendingCrit(ctx, attacker.key, moveId, line.turnNumber);
    },
    "-miss": (line, ctx, parentLine) => {
      const field = ctx.field;
      const attacker = this.getPokemonFromArgs(line.args.source, field);
      const target = this.getPokemonFromArgs(line.args.target, field);
      if (!attacker) return;

      const moveId =
        parentLine?.action === "move" && parentLine.args.move
          ? toID(parentLine.args.move)
          : undefined;
      const claimed = moveId
        ? this.claimMoveLuckEntry(ctx, attacker.key, moveId, line.turnNumber)
        : undefined;

      if (claimed?.miss) {
        claimed.miss.target = target?.key ?? claimed.miss.target;
        claimed.miss.hit = false;
      }
      if (moveId)
        this.consumePendingCrit(ctx, attacker.key, moveId, line.turnNumber);
    },
    "-ability": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon || !line.args.ability) return;
      pokemon.ability = line.args.ability;
    },
    "-activate": (line, ctx) => {
      const field = ctx.field;
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon) return;
      if (line.args.effect?.startsWith("ability:")) {
        ctx.lastAbilityActivation = {
          pokemonKey: pokemon.key,
          lineSeq: ctx.lineSeq,
        };
      }
      const effectName = line.args.effect?.replace(/^move:\s*/i, "");
      if (effectName === "Destiny Bond") {
        const lastDamage =
          pokemon.damageHistory[pokemon.damageHistory.length - 1];
        const attackerKey = lastDamage?.attacker;
        const attacker = this.getPokemonFromArgs(attackerKey, field);
        if (attacker) attacker.flags.destinyBond = pokemon.key;
      }
    },
    "-crit": (line, ctx, parentLine) => {
      const field = ctx.field;
      if (!parentLine || parentLine.action !== "move") return;
      const attacker = this.getPokemonFromArgs(
        parentLine.args.attacker ?? parentLine.args.pokemon,
        field,
      );
      if (!attacker || !parentLine.args.move) return;
      const moveId = toID(parentLine.args.move);
      this.setPendingCrit(ctx, attacker.key, moveId, line.turnNumber);
    },
    "-curestatus": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon) return;
      pokemon.status = {
        raw: "healthy",
      };
    },
    "-damage": (line, ctx, parentLine) => {
      const field = ctx.field;
      const damaged = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!damaged) return;

      const source = line.args.from
        ? this.findDamageSource(field, damaged, line.args.from)
        : undefined;
      const endedCondition =
        !line.args.from &&
        parentLine?.action !== "move" &&
        ctx.lastEndedCondition?.pokemonKey === damaged.key &&
        ctx.lastEndedCondition.turnNumber === line.turnNumber &&
        isDelayedDamageEffect(ctx.lastEndedCondition.condition.raw)
          ? ctx.lastEndedCondition.condition
          : undefined;
      if (endedCondition) ctx.lastEndedCondition = undefined;

      const isChildOfMove = parentLine?.action === "move";
      const hasEffectSource = Boolean(line.args.from || endedCondition);
      const indirect =
        Boolean(line.args.from) || (!isChildOfMove && !endedCondition);
      const parentMoveAttacker = isChildOfMove
        ? this.getPokemonFromArgs(
            parentLine.args.attacker ?? parentLine.args.pokemon,
            field,
          )
        : undefined;
      const selfInflictedCost =
        hasEffectSource && parentMoveAttacker?.key === damaged.key
          ? damaged
          : undefined;
      const attacker =
        this.getPokemonFromArgs(
          line.args.of ??
            source?.setterPokemon ??
            endedCondition?.setterPokemon,
          field,
        ) ??
        selfInflictedCost ??
        (!hasEffectSource ? parentMoveAttacker : undefined);

      const hpBefore = getHpPercent(damaged);
      const parsedHp = parseHpStatus(line.args.hpStatus);
      const hpAfter = parsedHp?.percent ?? hpBefore;

      const damageContext: DamageData = {
        turnNumber: line.turnNumber,
        damageTaken: Math.max(hpBefore - hpAfter, 0),
        hpBefore,
        hpAfter,
        indirect,
        selfInflicted: attacker ? attacker.key === damaged.key : undefined,
        friendlyFire: attacker
          ? attacker.sideId === damaged.sideId && attacker.key !== damaged.key
          : undefined,
        move:
          isChildOfMove && !hasEffectSource
            ? parentLine.args.move
            : (source?.sourceMove ?? endedCondition?.sourceMove),
        cause: prettifyCause(
          source?.name ??
            endedCondition?.name ??
            line.args.from ??
            (isChildOfMove ? parentLine.args.move : parentLine?.action),
          field.genNum,
        ),
        attacker: attacker?.key,
        attackerSideId:
          attacker?.sideId ??
          source?.setterSideId ??
          endedCondition?.setterSideId,
      };

      this.applyHpStatus(damaged, line.args.hpStatus, damageContext);
      if (isChildOfMove && !hasEffectSource && parentLine.args.move) {
        const moveAttacker = this.getPokemonFromArgs(
          parentLine.args.attacker ?? parentLine.args.pokemon,
          field,
        );
        if (moveAttacker) {
          const moveId = toID(parentLine.args.move);
          const claimed = this.claimMoveLuckEntry(
            ctx,
            moveAttacker.key,
            moveId,
            line.turnNumber,
          );
          if (claimed?.crit) {
            claimed.crit.target = damaged.key;
            claimed.crit.hit = this.consumePendingCrit(
              ctx,
              moveAttacker.key,
              moveId,
              line.turnNumber,
            );
          }
          if (claimed?.miss) {
            claimed.miss.target = damaged.key;
            claimed.miss.hit = true;
          }
        }
      }
    },
    "-endability": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon) return;
      pokemon.ability = undefined;
    },
    "-enditem": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon) return;
      pokemon.item = undefined;
    },
    "-end": (line, ctx) => {
      const field = ctx.field;
      if (!line.args.pokemon || !line.args.effect) return;
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      const position = this.getPositionFromArgs(line.args.pokemon, field);
      const sideId = parseSideId(line.args.pokemon);

      let removed = position
        ? removeConditionFromList(position.conditions, line.args.effect)
        : undefined;
      if (!removed && sideId) {
        removed = removeConditionFromList(
          field.sides[sideId].conditions,
          line.args.effect,
        );
      }
      if (!removed) return;
      ctx.lastEndedCondition = {
        condition: removed,
        pokemonKey: pokemon?.key,
        turnNumber: line.turnNumber,
      };
    },
    "-start": (line, ctx, parentLine) => {
      const field = ctx.field;
      if (!line.args.pokemon || !line.args.effect) return;

      if (/^perish\d+$/.test(line.args.effect)) {
        const position = this.getPositionFromArgs(line.args.pokemon, field);
        if (!position) return;
        const existing = position.conditions.find((condition) =>
          /^perish\d+$/.test(condition.id),
        );
        if (existing) {
          existing.raw = line.args.effect;
          existing.name = line.args.effect;
          existing.id = toID(line.args.effect);
          return;
        }
        const perishCondition = this.createConditionState(
          line.args.effect,
          line,
          ctx,
          parentLine,
        );
        perishCondition.sourceMove = "Perish Song";
        position.conditions.push(perishCondition);
        return;
      }

      const condition = this.createConditionState(
        line.args.effect,
        line,
        ctx,
        parentLine,
      );

      if (isDelayedDamageEffect(line.args.effect)) {
        if (!condition.setterPokemon) {
          const user = this.getPokemonFromArgs(line.args.pokemon, field);
          condition.setterPokemon = user?.key;
          condition.setterSideId = user?.sideId;
        }
        const targetRef =
          parentLine?.action === "move"
            ? (parentLine.args.target ?? line.args.pokemon)
            : line.args.pokemon;
        const targetSideId = parseSideId(targetRef);
        if (!targetSideId) return;
        ensureConditionInList(field.sides[targetSideId].conditions, condition);
        return;
      }

      const position = this.getPositionFromArgs(line.args.pokemon, field);
      if (!position) return;
      ensureConditionInList(position.conditions, condition);
    },
    "-fieldend": (line, ctx) => {
      if (!line.args.condition) return;
      removeConditionFromList(ctx.field.conditions, line.args.condition);
    },
    "-fieldstart": (line, ctx, parentLine) => {
      if (!line.args.condition) return;
      ensureConditionInList(
        ctx.field.conditions,
        this.createConditionState(line.args.condition, line, ctx, parentLine),
      );
    },
    "-formechange": (line, ctx) =>
      this.applyDetailsTransformLike(line, ctx.field),
    "-heal": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon) return;
      this.applyHpStatus(pokemon, line.args.hpStatus, undefined, {
        turnNumber: line.turnNumber,
        source: line.args.from,
      });
    },
    "-hitcount": (line, ctx, parentLine) => {
      const field = ctx.field;
      const hitCount = Number(line.args.num);
      if (!Number.isFinite(hitCount) || hitCount <= 1) return;

      const moveInfo =
        parentLine?.action === "move" && parentLine.args.move
          ? {
              attackerRef: parentLine.args.attacker ?? parentLine.args.pokemon,
              moveId: toID(parentLine.args.move),
              moveRaw: parentLine.args.move,
            }
          : ctx.lastMove
            ? {
                attackerRef: ctx.lastMove.attackerKey,
                moveId: ctx.lastMove.moveId,
                moveRaw: ctx.lastMove.moveRaw,
              }
            : undefined;
      if (!moveInfo) return;
      const attacker = this.getPokemonFromArgs(moveInfo.attackerRef, field);
      if (!attacker) return;

      const accuracyExpected = getMoveAccuracy(moveInfo.moveId, field.genNum);
      const critExpected = getMoveCritChance(moveInfo.moveId, field.genNum);
      const target = this.getPokemonFromArgs(line.args.pokemon, field)?.key;

      const extraCritEvents: CritLuckEvent[] = [];
      for (let hit = 1; hit < hitCount; hit++) {
        if (accuracyExpected !== undefined) {
          attacker.missHistory.push({
            turnNumber: line.turnNumber,
            move: moveInfo.moveRaw,
            target,
            expected: accuracyExpected,
            hit: true,
          });
        }
        if (critExpected !== undefined) {
          const critEvent: CritLuckEvent = {
            turnNumber: line.turnNumber,
            move: moveInfo.moveRaw,
            target,
            expected: critExpected,
            hit: false,
          };
          attacker.critHistory.push(critEvent);
          extraCritEvents.push(critEvent);
        }
      }

      while (
        extraCritEvents.length > 0 &&
        this.consumePendingCrit(
          ctx,
          attacker.key,
          moveInfo.moveId,
          line.turnNumber,
        )
      ) {
        const critEvent = extraCritEvents.pop();
        if (critEvent) critEvent.hit = true;
      }
    },
    "-item": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon || !line.args.item) return;
      pokemon.item = {
        raw: line.args.item,
      };
    },
    "-sethp": (line, ctx, parentLine) => {
      const field = ctx.field;
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !line.args.hp) return;
      const hpBefore = getHpPercent(pokemon);
      const parsedHp = parseHpStatus(line.args.hp);
      const hpAfter = parsedHp?.percent ?? hpBefore;
      const moveAttacker =
        parentLine?.action === "move"
          ? this.getPokemonFromArgs(
              parentLine.args.attacker ?? parentLine.args.pokemon,
              field,
            )
          : undefined;
      const attacker =
        this.getPokemonFromArgs(line.args.of, field) ??
        (moveAttacker && moveAttacker.key !== pokemon.key
          ? moveAttacker
          : undefined);
      this.applyHpStatus(
        pokemon,
        line.args.hp,
        {
          turnNumber: line.turnNumber,
          damageTaken: Math.max(hpBefore - hpAfter, 0),
          hpBefore,
          hpAfter,
          indirect: true,
          cause: prettifyCause(
            line.args.from ?? parentLine?.args.move,
            field.genNum,
          ),
          attacker: attacker?.key,
          attackerSideId: attacker?.sideId,
        },
        { turnNumber: line.turnNumber, source: line.args.from },
      );
    },
    "-sideend": (line, ctx) => {
      const sideId = parseSideId(line.args.side);
      if (!sideId || !line.args.condition) return;
      removeConditionFromList(
        ctx.field.sides[sideId].conditions,
        line.args.condition,
      );
    },
    "-sidestart": (line, ctx, parentLine) => {
      const sideId = parseSideId(line.args.side);
      if (!sideId || !line.args.condition) return;
      ensureConditionInList(
        ctx.field.sides[sideId].conditions,
        this.createConditionState(line.args.condition, line, ctx, parentLine),
      );
    },
    "-singlemove": (line, ctx, parentLine) =>
      this.applySingleTurnCondition(line, ctx, parentLine),
    "-singleturn": (line, ctx, parentLine) =>
      this.applySingleTurnCondition(line, ctx, parentLine),
    "-status": (line, ctx, parentLine) => {
      const field = ctx.field;
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, field);
      if (!pokemon || !line.args.status) return;
      pokemon.status = {
        raw: line.args.status,
        setter: this.resolveStatusSetter(line, field, pokemon, parentLine)?.key,
      };
    },
    "-transform": (line, ctx) =>
      this.applyDetailsTransformLike(line, ctx.field),
    "-terastallize": (line, ctx) => {
      const pokemon = this.getPokemonFromArgs(line.args.pokemon, ctx.field);
      if (!pokemon || !line.args.type) return;
      pokemon.teraType = line.args.type;
    },
    "-weather": (line, ctx, parentLine) => {
      const field = ctx.field;
      const weather = line.args.weather;
      if (!weather || weather === "none") {
        field.weather = undefined;
        return;
      }
      if (line.args.upkeep && field.weather?.raw === weather) return;
      field.weather = this.createConditionState(weather, line, ctx, parentLine);
    },
  };

  build(parsedLogs: ParsedReplayLog): ReplayBuildResult {
    const ctx: BuildContext = {
      field: defaultField(),
      pendingMoveLuck: new Map(),
      pendingCrit: new Map(),
      lineSeq: 0,
      warnings: [],
    };

    const turns = parsedLogs.turns.map((turn) => {
      ctx.field.turnNumber = turn.number;

      turn.lines.forEach((line) => {
        this.executeLine(line, ctx);
        line.children?.forEach((child) => this.executeLine(child, ctx, line));
      });

      const snapshot = snapshotTurn(ctx.field, turn.number);

      SIDE_IDS.forEach((sideId) => {
        POSITION_IDS.forEach((positionId) => {
          const position = ctx.field.sides[sideId].positions[positionId];
          position.conditions = position.conditions.filter(
            (condition) => !condition.singleTurn,
          );
        });
        Object.values(ctx.field.sides[sideId].pokemon).forEach((pokemon) => {
          delete pokemon.flags.destinyBond;
        });
      });

      return snapshot;
    });

    return { field: ctx.field, turns, warnings: ctx.warnings };
  }

  private resolveFaintContext(
    line: ReplayLine,
    ctx: BuildContext,
    pokemon: Pokemon,
    position: Position | undefined,
  ): FaintState {
    const field = ctx.field;

    if (pokemon.flags.destinyBond) {
      const attacker = this.getPokemonFromArgs(
        pokemon.flags.destinyBond,
        field,
      );
      return {
        turnNumber: line.turnNumber,
        sourceAction: "destinybond",
        attackerSideId: attacker?.sideId,
        attackerPokemon: attacker?.key,
        move: "Destiny Bond",
        cause: "Destiny Bond",
        indirect: true,
      };
    }

    if (
      ctx.lastMove &&
      ctx.lastMove.attackerKey === pokemon.key &&
      ctx.lastMove.turnNumber === line.turnNumber
    ) {
      const move = gens.get(field.genNum ?? 9).moves.get(ctx.lastMove.moveId);
      if (move?.exists && move.selfdestruct) {
        return {
          turnNumber: line.turnNumber,
          sourceAction: "selfdestruct",
          attackerSideId: pokemon.sideId,
          attackerPokemon: pokemon.key,
          move: move.name,
          cause: move.name,
        };
      }
    }

    const perishCondition = position?.conditions.find(
      (condition) => condition.id === "perish0",
    );
    if (perishCondition) {
      const setter = this.getPokemonFromArgs(
        perishCondition.setterPokemon,
        field,
      );
      return {
        turnNumber: line.turnNumber,
        sourceAction: "perishsong",
        attackerSideId: setter?.sideId ?? perishCondition.setterSideId,
        attackerPokemon: perishCondition.setterPokemon,
        move: "Perish Song",
        cause: "Perish Song",
        indirect: true,
      };
    }

    const lastDamage = pokemon.damageHistory[pokemon.damageHistory.length - 1];
    return {
      turnNumber: line.turnNumber,
      sourceAction: line.action,
      attackerSideId:
        lastDamage?.attackerSideId ?? parseSideId(lastDamage?.attacker),
      attackerPokemon: lastDamage?.attacker,
      move: lastDamage?.move,
      cause: lastDamage?.cause,
      indirect: lastDamage?.indirect,
    };
  }

  private executeLine(
    line: ReplayLine,
    ctx: BuildContext,
    parentLine?: ReplayLine,
  ): void {
    ctx.lineSeq++;
    const handler = this.actionFns[line.action];
    if (!handler) return;
    try {
      handler(line, ctx, parentLine);
    } catch (error) {
      ctx.warnings.push({
        lineId: line.id,
        action: line.action,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createConditionState(
    condition: string,
    line: ReplayLine,
    ctx: BuildContext,
    parentLine?: ReplayLine,
    singleTurn?: boolean,
  ): ConditionState {
    const field = ctx.field;
    const name = normalizeConditionName(condition);
    const conditionSourceMove = condition.startsWith("move: ")
      ? name
      : undefined;
    const parentSourceMove =
      parentLine?.action === "move" ? parentLine.args.move : undefined;

    const ofPokemon = this.getPokemonFromArgs(line.args.of, field);
    const abilityActivation =
      ctx.lastAbilityActivation?.lineSeq === ctx.lineSeq - 1
        ? this.getPokemonFromArgs(ctx.lastAbilityActivation.pokemonKey, field)
        : undefined;
    const parentMoveAttacker =
      parentLine?.action === "move"
        ? this.getPokemonFromArgs(
            parentLine.args.attacker ?? parentLine.args.pokemon,
            field,
          )
        : undefined;
    const sourceMove = abilityActivation
      ? conditionSourceMove
      : (parentSourceMove ?? conditionSourceMove);
    const setterPokemon =
      ofPokemon ??
      abilityActivation ??
      parentMoveAttacker ??
      this.findMoveUser(field, sourceMove, line.turnNumber);

    return {
      raw: condition,
      name,
      id: toID(name),
      setterSideId: setterPokemon?.sideId,
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
    ctx: BuildContext,
    parentLine?: ReplayLine,
  ): void {
    const sideId = parseSideId(line.args.pokemon);
    if (!sideId || !line.args.move) return;

    const positionId = parsePokemonRef(line.args.pokemon)?.positionId;
    if (!positionId) return;

    const position = ctx.field.sides[sideId].positions[positionId];
    if (!position) return;

    position.conditions.push(
      this.createConditionState(line.args.move, line, ctx, parentLine, true),
    );
  }

  private resolveStatusSetter(
    line: ReplayLine,
    field: Field,
    victim: Pokemon,
    parentLine?: ReplayLine,
  ): Pokemon | undefined {
    if (line.args.from?.startsWith("item:")) return victim;

    const ofPokemon = this.getPokemonFromArgs(line.args.of, field);
    if (ofPokemon) return ofPokemon;

    if (parentLine?.action === "move") {
      return this.getPokemonFromArgs(
        parentLine.args.attacker ?? parentLine.args.pokemon,
        field,
      );
    }

    const isSwitchLike =
      parentLine !== undefined &&
      ["switch", "drag", "replace"].includes(parentLine.action);
    if (
      isSwitchLike &&
      (line.args.status === "psn" || line.args.status === "tox")
    ) {
      const toxicSpikes = field.sides[victim.sideId].conditions.find(
        (condition) => condition.id === "toxicspikes",
      );
      return this.getPokemonFromArgs(toxicSpikes?.setterPokemon, field);
    }

    return undefined;
  }

  private findDamageSource(
    field: Field,
    damaged: Pokemon,
    cause: string,
  ): ConditionState | undefined {
    const causeId = toID(cause);

    if (STATUS_DAMAGE_IDS.has(causeId)) {
      return {
        raw: cause,
        name: cause,
        id: causeId,
        setterPokemon: damaged.status?.setter,
        setterSideId: parseSideId(damaged.status?.setter),
      };
    }

    if (causeId === "recoil" || cause.startsWith("item:")) {
      return {
        raw: cause,
        name: normalizeConditionName(cause),
        id: causeId,
        setterPokemon: damaged.key,
        setterSideId: damaged.sideId,
      };
    }

    if (cause.startsWith("ability:")) return undefined;

    const matches = conditionMatcher(cause);

    const position = this.findPositionOfPokemon(field, damaged);
    const positionCondition = position?.conditions.find(matches);
    if (positionCondition) return positionCondition;

    const sideCondition = field.sides[damaged.sideId].conditions.find(matches);
    if (sideCondition) return sideCondition;

    const fieldCondition = field.conditions.find(matches);
    if (fieldCondition) return fieldCondition;

    if (field.weather && matches(field.weather)) return field.weather;

    return undefined;
  }

  private findPositionOfPokemon(
    field: Field,
    pokemon: Pokemon,
  ): Position | undefined {
    return Object.values(field.sides[pokemon.sideId].positions).find(
      (position) => position.pokemon?.key === pokemon.key,
    );
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
    const ofPokemon = this.getPokemonFromArgs(line.args.of, field);
    if (ofPokemon) return ofPokemon;
    if (line.args.from) return boostedPokemon;
    return undefined;
  }

  private recordMoveLuck(
    pokemon: Pokemon,
    moveId: string,
    line: ReplayLine,
    ctx: BuildContext,
  ): void {
    if (!line.args.move) return;
    const field = ctx.field;

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

    const existing = ctx.pendingMoveLuck.get(queueKey);
    ctx.pendingMoveLuck.set(
      queueKey,
      existing ? [...existing, ...queue] : queue,
    );
  }

  private moveLuckQueueKey(
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): string {
    return `${attackerKey}|${moveId}|${turnNumber}`;
  }

  private claimMoveLuckEntry(
    ctx: BuildContext,
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): { crit?: CritLuckEvent; miss?: MissLuckEvent } | undefined {
    const queueKey = this.moveLuckQueueKey(attackerKey, moveId, turnNumber);
    const queue = ctx.pendingMoveLuck.get(queueKey);
    if (!queue || queue.length === 0) return undefined;
    return queue.shift();
  }

  private setPendingCrit(
    ctx: BuildContext,
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): void {
    const key = this.moveLuckQueueKey(attackerKey, moveId, turnNumber);
    ctx.pendingCrit.set(key, (ctx.pendingCrit.get(key) ?? 0) + 1);
  }

  private consumePendingCrit(
    ctx: BuildContext,
    attackerKey: PokemonKey,
    moveId: string,
    turnNumber: number,
  ): boolean {
    const key = this.moveLuckQueueKey(attackerKey, moveId, turnNumber);
    const count = ctx.pendingCrit.get(key) ?? 0;
    if (count <= 0) return false;
    if (count === 1) ctx.pendingCrit.delete(key);
    else ctx.pendingCrit.set(key, count - 1);
    return true;
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
    if (pokemonRef?.hasPosition) {
      return field.sides[pokemonRef.sideId].positions[pokemonRef.positionId];
    }

    const sideId = parseSideId(pokemonRefRaw);
    if (!sideId) return undefined;

    const side = field.sides[sideId];
    const pokemon = this.getPokemonFromArgs(pokemonRefRaw, field);
    return Object.values(side.positions).find(
      (position) =>
        position.pokemon &&
        (position.pokemon.key === pokemonRefRaw ||
          position.pokemon.key === pokemon?.key),
    );
  }

  private applySwitchLike(
    line: ReplayLine,
    field: Field,
    options: { clearVolatiles?: boolean } = {},
  ): void {
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
    pokemon.everActive = true;
    if (speciesId) pokemon.species = speciesId;
    if (baseSpeciesId) pokemon.baseSpecies = baseSpeciesId;
    pushUnique(pokemon.speciesHistory, speciesId);
    pokemon.gender = gender;
    pokemon.shiny = shiny;
    if (line.args.details) pokemon.details = line.args.details;
    pushUnique(pokemon.detailsHistory, line.args.details);

    const hp = parseHpStatus(line.args.hpStatus);
    if (hp) {
      const previousPercent = pokemon.hp?.percent;
      if (
        typeof previousPercent === "number" &&
        typeof hp.percent === "number" &&
        hp.percent > previousPercent
      ) {
        pokemon.healHistory.push({
          turnNumber: line.turnNumber,
          amount: hp.percent - previousPercent,
          source: "switch",
        });
      }
      pokemon.hp = hp;
    }

    const position = side.positions[pokemonRef.positionId];
    if (options.clearVolatiles !== false) position.conditions = [];
    position.pokemon = pokemon;
  }

  private resolvePokemonByRef(
    pokemonRef: PokemonRef,
    field: Field,
  ): Pokemon | undefined {
    const side = field.sides[pokemonRef.sideId];

    if (pokemonRef.hasPosition) {
      const activePokemon = side.positions[pokemonRef.positionId].pokemon;
      if (activePokemon) return activePokemon;
    }

    const direct = side.pokemon[pokemonRef.canonicalKey];
    if (direct) return direct;

    return Object.values(side.pokemon).find(
      (pokemon) => pokemon.nickname === pokemonRef.nickname,
    );
  }

  private applyHpStatus(
    pokemon: Pokemon | undefined,
    hpStatus: HPSTATUS | HP | undefined,
    damageContext?: DamageData,
    healContext?: { turnNumber: number; source?: string },
  ): void {
    if (!pokemon || !hpStatus) return;
    const previousPercent =
      typeof pokemon.hp?.percent === "number" ? pokemon.hp.percent : undefined;
    const hp = parseHpStatus(hpStatus);
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
      if (damageContext) pokemon.damageHistory.push(damageContext);
    } else if (hpDelta < 0) {
      pokemon.fainted = undefined;
      if (healContext) {
        pokemon.healHistory.push({
          turnNumber: healContext.turnNumber,
          amount: -hpDelta,
          source: healContext.source,
        });
      }
    }
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
