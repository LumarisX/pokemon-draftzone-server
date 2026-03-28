import { Data, GenderName, Generations, ID, toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { ReplayLine, ParsedReplayLog } from "./replay-parse.service";
import { HP, HPSTATUS } from ".";

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

export type FaintState = {
  turnNumber: number;
  sourceAction: string;
  attackerSideId?: SideId;
  attackerPokemon?: string;
  move?: string;
  cause?: string;
  indirect?: boolean;
};

export type Pokemon = {
  key: string;
  sideId: SideId;
  nickname: string;
  species?: string;
  baseSpecies?: string;
  speciesHistory: string[];
  detailsHistory: string[];
  moveset: string[];
  moveHistory: Record<string, MoveData[]>;
  damageHistory: DamageData[];
  details?: string;
  hp: HPState;
  status?: string;
  fainted?: FaintState;
  item?: string;
  ability?: string;
  teraType?: string;
  shiny?: true;
  gender?: GenderName;
  flags: {
    destinyBond?: true;
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
        fainted: value.fainted ? { ...value.fainted } : undefined,
        hp: { ...value.hp },
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

function parseHpStatus(hpStatus: string | undefined): {
  hp?: HPState;
  status?: string;
} {
  if (!hpStatus) return {};

  const normalized = hpStatus.trim();
  // Replay metadata tokens such as [silent] are not HP/status updates.
  if (normalized.startsWith("[")) return {};

  const [hpRaw, statusRaw] = normalized.split(/\s+/, 2);
  const hp = parseHpState(hpRaw);
  const status = statusRaw?.trim();

  return {
    hp,
    status,
  };
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
    hp: {
      raw: "100/100",
      current: 100,
      max: 100,
      percent: 100,
    },
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

export class ReplayStatesService {
  private readonly actionFns: Record<
    string,
    (line: ReplayLine, field: Field, parentLine?: ReplayLine) => void
  > = {
    detailschange: (line, field) => this.applyDetailsTransformLike(line, field),
    drag: (line, field) => this.applySwitchLike(line, field),
    faint: (line, field, _parentLine) => {
      const position = this.getPositionFromArgs(line.parsedArgs.pokemon, field);
      const pokemon = position?.pokemon;
      if (!pokemon) return;

      const lastDamage =
        pokemon.damageHistory[pokemon.damageHistory.length - 1];
      const fainted = {
        turnNumber: line.turnNumber,
        sourceAction: line.action,
        attackerSideId:
          lastDamage?.attackerSideId ?? parseSideId(lastDamage?.attacker),
        attackerPokemon: lastDamage?.attacker,
        move: lastDamage?.move,
        cause: lastDamage?.cause,
        indirect: lastDamage?.indirect,
      };

      if (!fainted.attackerPokemon || !fainted.attackerSideId) {
        let destinyBondSource: Pokemon | undefined;

        for (const sideId of SIDE_IDS) {
          if (sideId === pokemon.sideId) continue;
          const source = Object.values(field.sides[sideId].pokemon).find(
            (pokemon) => pokemon.flags.destinyBond,
          );
          if (source) destinyBondSource = source;
        }

        if (destinyBondSource) {
          fainted.attackerPokemon = destinyBondSource.key;
          fainted.attackerSideId = destinyBondSource.sideId;
          fainted.move = "Destiny Bond";
          fainted.cause = "move: Destiny Bond";
          fainted.indirect = true;
        }
      }

      const attacker = this.getPokemonFromArgs(fainted.attackerPokemon, field);
      if (attacker?.flags.destinyBond && attacker.sideId !== pokemon.sideId) {
        fainted.move = "Destiny Bond";
        fainted.cause = "move: Destiny Bond";
        fainted.indirect = true;
      }

      pokemon.fainted = fainted;
      pokemon.status = "fnt";
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
      const sideId = parseSideId(line.parsedArgs.player);
      if (!sideId || !line.parsedArgs.username) return;
      field.sides[sideId].username = line.parsedArgs.username;
    },
    poke: (line, field) => {
      const sideId = parseSideId(line.parsedArgs.player);
      if (!sideId || !line.parsedArgs.details) return;
      const { speciesId, baseSpeciesId, gender, shiny } = parseSpeciesDetails(
        line.parsedArgs.details,
        field.genNum,
      );
      if (!speciesId) return;

      const key = `${sideId}: ${baseSpeciesId ?? speciesId}`;
      const pokemon = upsertPokemon(field.sides[sideId], key, speciesId);
      pokemon.details = line.parsedArgs.details;
      pushUnique(pokemon.detailsHistory, line.parsedArgs.details);
      pokemon.species = speciesId;
      pokemon.baseSpecies = baseSpeciesId ?? speciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
      pokemon.gender = gender;
      pokemon.shiny = shiny;
      if (line.parsedArgs.item) pokemon.item = line.parsedArgs.item;
    },
    gametype: (line, field) => {
      if (line.parsedArgs.gameType) field.gameType = line.parsedArgs.gameType;
    },
    gen: (line, field) => {
      const genNum = line.parsedArgs.genNum
        ? Number(line.parsedArgs.genNum)
        : NaN;
      if (!Number.isFinite(genNum)) return;
      field.genNum = genNum;
    },
    move: (line, field) => {
      const pokemon = this.getPokemonFromArgs(
        line.parsedArgs.attacker ?? line.parsedArgs.pokemon,
        field,
      );
      if (!pokemon || !line.parsedArgs.move) return;
      if (!pokemon.moveset.includes(line.parsedArgs.move)) {
        pokemon.moveset.push(line.parsedArgs.move);
      }

      const moveId = toID(line.parsedArgs.move);
      const history = pokemon.moveHistory[moveId] ?? [];
      history.push({
        turnNumber: line.turnNumber,
        raw: line.parsedArgs.move,
        target: line.parsedArgs.target,
      });
      pokemon.moveHistory[moveId] = history;
    },
    replace: (line, field) => this.applySwitchLike(line, field),
    switch: (line, field) => {
      const pokemonRef = parsePokemonRef(line.parsedArgs.pokemon);
      if (pokemonRef) {
        field.sides[pokemonRef.sideId].stats.switches++;
      }
      this.applySwitchLike(line, field);
    },
    "t:": (line, field) => {
      const timestamp = line.parsedArgs.timestamp
        ? Number(line.parsedArgs.timestamp)
        : NaN;
      if (!Number.isFinite(timestamp)) return;
      if (field.timestampStart === undefined) field.timestampStart = timestamp;
      field.timestampEnd = timestamp;
    },
    teamsize: (line, field) => {
      const sideId = parseSideId(line.parsedArgs.player);
      const teamSize = line.parsedArgs.number
        ? Number(line.parsedArgs.number)
        : NaN;
      if (!sideId || !Number.isFinite(teamSize)) return;
      field.sides[sideId].teamSize = teamSize;
    },
    win: (line, field) => {
      if (line.parsedArgs.winner) field.winner = line.parsedArgs.winner;
    },
    "-ability": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.ability) return;
      pokemon.ability = line.parsedArgs.ability;
    },
    "-activate": (line, field, parentLine) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;
      const effectName = line.parsedArgs.effect?.replace(/^move:\s*/i, "");
      if (toID(effectName) === "destinybond") {
        pokemon.flags.destinyBond = true;
      }
    },
    "-curestatus": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;
      pokemon.status = "healthy";
    },
    "-damage": (line, field, parentLine) => {
      const damaged = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!damaged) return;
      const majorArgs = line.parsedArgs as typeof line.parsedArgs & {
        from?: string;
        of?: string;
      };
      const source = majorArgs.from
        ? this.findConditionSource(field, damaged.sideId, majorArgs.from)
        : undefined;
      const target = this.getPokemonFromArgs(
        parentLine?.parsedArgs.target,
        field,
      );
      const attackerRef =
        source?.setterPokemon ??
        parentLine?.parsedArgs.attacker ??
        parentLine?.parsedArgs.pokemon ??
        majorArgs.of;
      const attacker = this.getPokemonFromArgs(attackerRef, field);

      const indirect = target !== damaged || Boolean(source || majorArgs.from);

      const { hp, status } = parseHpStatus(line.parsedArgs.hpStatus);

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
        move:
          parentLine?.parsedArgs.move ?? source?.sourceMove ?? majorArgs.from,
        cause: source?.name ?? majorArgs.from ?? parentLine?.action,
        attacker: attackerRef,
        attackerSideId: attacker?.sideId ?? source?.setterSideId,
      };

      this.applyHpStatus(damaged, line.parsedArgs.hpStatus, damageContext);
    },
    "-endability": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;
      pokemon.ability = undefined;
    },
    "-enditem": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;
      pokemon.item = undefined;
    },
    "-fieldend": (line, field) => {
      if (!line.parsedArgs.condition) return;
      removeConditionFromList(field.conditions, line.parsedArgs.condition);
    },
    "-fieldstart": (line, field, parentLine) => {
      if (!line.parsedArgs.condition) return;
      ensureConditionInList(
        field.conditions,
        this.createConditionState(
          line.parsedArgs.condition,
          field,
          parentLine,
          line.turnNumber,
        ),
      );
    },
    "-formechange": (line, field) =>
      this.applyDetailsTransformLike(line, field),
    "-heal": (line, field, parentLine) => {
      const position = this.getPositionFromArgs(line.parsedArgs.pokemon, field);
      const pokemon = position?.pokemon;
      if (!pokemon) return;
      this.applyHpStatus(pokemon, line.parsedArgs.hpStatus);
    },
    "-item": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.item) return;
      pokemon.item = line.parsedArgs.item;
    },
    "-sethp": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.hp) return;
      const parsedHp = parseHpState(line.parsedArgs.hp);
      if (parsedHp) {
        pokemon.hp = {
          ...pokemon.hp,
          ...parsedHp,
        };
      }
    },
    "-sideend": (line, field) => {
      const sideId = parseSideId(line.parsedArgs.side);
      if (!sideId || !line.parsedArgs.condition) return;
      removeConditionFromList(
        field.sides[sideId].conditions,
        line.parsedArgs.condition,
      );
    },
    "-sidestart": (line, field, parentLine) => {
      const sideId = parseSideId(line.parsedArgs.side);
      if (!sideId || !line.parsedArgs.condition) return;
      ensureConditionInList(
        field.sides[sideId].conditions,
        this.createConditionState(
          line.parsedArgs.condition,
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
    "-status": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.status) return;
      pokemon.status = line.parsedArgs.status;
    },
    "-transform": (line, field) => this.applyDetailsTransformLike(line, field),
    "-terastallize": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.type) return;
      pokemon.teraType = line.parsedArgs.type;
    },
    "-weather": (line, field) => {
      field.weather =
        line.parsedArgs.weather && line.parsedArgs.weather !== "none"
          ? line.parsedArgs.weather
          : undefined;
    },
  };

  build(parsedLogs: ParsedReplayLog): TurnState[] {
    const { turns } = parsedLogs;
    const field = defaultField();

    return turns.map((turn) => {
      field.turnNumber = turn.number;

      turn.lines.forEach((line) => {
        this.actionFns[line.action]?.(line, field);
        if ("children" in line)
          line.children.forEach((child) => {
            this.actionFns[child.action]?.(child, field, child.parent);
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
        ? parentLine.parsedArgs.move
        : condition.startsWith("move: ")
          ? name
          : undefined;
    const setterPokemonRef =
      parentLine?.action === "move"
        ? (parentLine.parsedArgs.attacker ?? parentLine.parsedArgs.pokemon)
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
    const sideId = parseSideId(line.parsedArgs.pokemon);
    if (!sideId || !line.parsedArgs.move) return;

    const positionId = parsePokemonRef(line.parsedArgs.pokemon)?.positionId;
    if (!positionId) return;

    const position = field.sides[sideId].positions[positionId];
    if (!position) return;

    const condition = this.createConditionState(
      line.parsedArgs.move,
      field,
      parentLine,
      line.turnNumber,
      true,
    );
    position.conditions.push(condition);

    if (toID(line.parsedArgs.move) === "destinybond") {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (pokemon) pokemon.flags.destinyBond = true;
    }
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
    const pokemonRef = parsePokemonRef(line.parsedArgs.pokemon);
    if (!pokemonRef) return;

    const side = field.sides[pokemonRef.sideId];
    const { speciesId, baseSpeciesId, gender, shiny } = parseSpeciesDetails(
      line.parsedArgs.details,
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
    if (line.parsedArgs.details) pokemon.details = line.parsedArgs.details;
    pushUnique(pokemon.detailsHistory, line.parsedArgs.details);

    const { hp, status } = parseHpStatus(line.parsedArgs.hpStatus);
    if (hp) pokemon.hp = hp;
    if (status) pokemon.status = status;

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
    const { hp, status } = parseHpStatus(hpStatus);
    hp;
    if (hp)
      pokemon.hp = {
        ...pokemon.hp,
        ...hp,
      };
    if (status) pokemon.status = status;

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
    const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
    if (!pokemon) return;

    if (line.parsedArgs.details) {
      pokemon.details = line.parsedArgs.details;
      pushUnique(pokemon.detailsHistory, line.parsedArgs.details);
      const { speciesId, baseSpeciesId, gender, shiny } = parseSpeciesDetails(
        line.parsedArgs.details,
        field.genNum,
      );
      if (speciesId) pokemon.species = speciesId;
      if (baseSpeciesId) pokemon.baseSpecies = baseSpeciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
      pokemon.gender = gender;
      pokemon.shiny = shiny;
    }
    if (line.parsedArgs.species) {
      const speciesId = toID(line.parsedArgs.species);
      const baseSpeciesId = toBaseSpeciesId(speciesId, field.genNum);
      pokemon.species = speciesId;
      pokemon.baseSpecies = baseSpeciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
    }
    if (line.parsedArgs.hpStatus) {
      const { hp, status } = parseHpStatus(line.parsedArgs.hpStatus);
      if (hp) pokemon.hp = hp;
      if (status) pokemon.status = status;
    }
  }
}
