import { Data, Generations, toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import {
  KnownReplayAction,
  ParsedReplayLine,
  ParsedReplayLog,
} from "./replay-parse.service";

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

export type Pokemon = {
  key: string;
  sideId: SideId;
  nickname: string;
  species?: string;
  baseSpecies?: string;
  speciesHistory: string[];
  detailsHistory: string[];
  moveset: string[];
  details?: string;
  hp?: HPState;
  status?: string;
  fainted: boolean;
  item?: string;
  ability?: string;
  teraType?: string;
};

export type Position = {
  id: PositionId;
  pokemonKey?: string;
  conditions: string[];
};

export type Side = {
  id: SideId;
  username?: string;
  teamSize?: number;
  stats: {
    switches: number;
  };
  conditions: string[];
  active: Record<PositionId, Position>;
  pokemon: Record<string, Pokemon>;
};

export type Field = {
  turnNumber: number;
  gameType?: string;
  genNum?: number;
  weather?: string;
  winner?: string;
  conditions: string[];
  sides: Record<SideId, Side>;
};

export type TurnState = {
  turnNumber: number;
  field: Field;
  actions: TurnAction[];
};

export type TurnAction = {
  action: string;
  parsedArgs: ParsedReplayLine["parsedArgs"];
  attackerSideId?: SideId;
  attackerPokemon?: string;
  attackerName?: string;
  move?: string;
  cause?: string;
  indirect?: boolean;
  victimSideId?: SideId;
  victimKey?: string;
  victimName?: string;
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
    active: {
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
    gameType: field.gameType,
    genNum: field.genNum,
    weather: field.weather,
    winner: field.winner,
    conditions: [...field.conditions],
    sides: {
      p1: cloneSide(field.sides.p1),
      p2: cloneSide(field.sides.p2),
      p3: cloneSide(field.sides.p3),
      p4: cloneSide(field.sides.p4),
    },
  };
}

function cloneSide(side: Side): Side {
  return {
    id: side.id,
    username: side.username,
    teamSize: side.teamSize,
    stats: { ...side.stats },
    conditions: [...side.conditions],
    active: {
      a: { ...side.active.a },
      b: { ...side.active.b },
      c: { ...side.active.c },
    },
    pokemon: Object.fromEntries(
      Object.entries(side.pokemon).map(([key, pokemon]) => [
        key,
        {
          ...pokemon,
          speciesHistory: [...pokemon.speciesHistory],
          detailsHistory: [...pokemon.detailsHistory],
          moveset: [...pokemon.moveset],
          hp: pokemon.hp ? { ...pokemon.hp } : undefined,
        },
      ]),
    ),
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
  const parsed = side.match(/^(p[1-4])/);
  if (!parsed || !parsed[1]) return undefined;
  return parsed[1] as SideId;
}

function parseSpeciesFromDetails(
  details: string | undefined,
): string | undefined {
  if (!details) return undefined;
  const [species] = details.split(",");
  return toID(species?.trim());
}

function toBaseSpeciesId(speciesId: string, genNum?: number): string {
  const fallback = toID(speciesId);
  if (!fallback) return fallback;

  const gen = gens.get(genNum ?? 9);
  const specie = gen.species.get(speciesId);
  if (!specie?.exists) return fallback;
  return toID(specie.baseSpecies || specie.name);
}

function parseSpeciesMeta(
  details: string | undefined,
  genNum?: number,
): {
  speciesId?: string;
  baseSpeciesId?: string;
} {
  const speciesId = parseSpeciesFromDetails(details);
  if (!speciesId) return {};

  return {
    speciesId,
    baseSpeciesId: toBaseSpeciesId(speciesId, genNum),
  };
}

function parseHpState(hpRaw: string | undefined): HPState | undefined {
  if (!hpRaw) return undefined;

  const hp = hpRaw.trim();
  const [currentRaw, maxRaw] = hp.split("/");
  if (!maxRaw) return { raw: hp };

  const current = Number(currentRaw);
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
  fainted?: boolean;
} {
  if (!hpStatus) return {};

  const normalized = hpStatus.trim();
  // Replay metadata tokens such as [silent] are not HP/status updates.
  if (normalized.startsWith("[")) return {};

  const [hpRaw, statusRaw] = normalized.split(/\s+/, 2);
  const hp = parseHpState(hpRaw);
  const status = statusRaw?.trim();
  const fainted = status === "fnt" || hp?.raw === "0/100" || hp?.current === 0;

  return {
    hp,
    status,
    fainted,
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
    fainted: false,
  };
  side.pokemon[key] = created;
  return created;
}

function ensureInList(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function removeFromList(values: string[], value: string): void {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
}

function pushUnique(values: string[], value: string | undefined): void {
  if (!value) return;
  if (!values.includes(value)) values.push(value);
}

export class ReplayStatesService {
  private readonly actionFns: Record<
    string,
    (line: ParsedReplayLine, field: Field) => void
  > = {
    player: (line, field) => {
      const sideId = parseSideId(line.parsedArgs.player);
      if (!sideId || !line.parsedArgs.username) return;
      field.sides[sideId].username = line.parsedArgs.username;
    },
    teamsize: (line, field) => {
      const sideId = parseSideId(line.parsedArgs.player);
      const teamSize = line.parsedArgs.number
        ? Number(line.parsedArgs.number)
        : NaN;
      if (!sideId || !Number.isFinite(teamSize)) return;
      field.sides[sideId].teamSize = teamSize;
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
    poke: (line, field) => {
      const sideId = parseSideId(line.parsedArgs.player);
      if (!sideId || !line.parsedArgs.details) return;
      const { speciesId, baseSpeciesId } = parseSpeciesMeta(
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
      if (line.parsedArgs.item) pokemon.item = line.parsedArgs.item;
    },
    drag: (line, field) => this.applySwitchLike(line, field),
    replace: (line, field) => this.applySwitchLike(line, field),
    switch: (line, field) => {
      const pokemonRef = parsePokemonRef(line.parsedArgs.pokemon);
      if (pokemonRef) {
        field.sides[pokemonRef.sideId].stats.switches++;
      }
      this.applySwitchLike(line, field);
    },
    move: (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.move) return;
      if (!pokemon.moveset.includes(line.parsedArgs.move)) {
        pokemon.moveset.push(line.parsedArgs.move);
      }
    },
    faint: (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;

      pokemon.fainted = true;
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
    "-sethp": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.hp) return;
      pokemon.hp = parseHpState(line.parsedArgs.hp);
    },
    "-damage": (line, field) => this.applyHpStatus(line, field),
    "-heal": (line, field) => this.applyHpStatus(line, field),
    "-status": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.status) return;
      pokemon.status = line.parsedArgs.status;
      if (line.parsedArgs.status === "fnt") pokemon.fainted = true;
    },
    "-curestatus": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;
      pokemon.status = "healthy";
    },
    "-ability": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.ability) return;
      pokemon.ability = line.parsedArgs.ability;
    },
    "-endability": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;
      pokemon.ability = undefined;
    },
    "-item": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon || !line.parsedArgs.item) return;
      pokemon.item = line.parsedArgs.item;
    },
    "-enditem": (line, field) => {
      const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
      if (!pokemon) return;
      pokemon.item = undefined;
    },
    detailschange: (line, field) => this.applyDetailsTransformLike(line, field),
    "-formechange": (line, field) =>
      this.applyDetailsTransformLike(line, field),
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
    "-fieldstart": (line, field) => {
      if (!line.parsedArgs.condition) return;
      ensureInList(field.conditions, line.parsedArgs.condition);
    },
    "-fieldend": (line, field) => {
      if (!line.parsedArgs.condition) return;
      removeFromList(field.conditions, line.parsedArgs.condition);
    },
    "-sidestart": (line, field) => {
      const sideId = parseSideId(line.parsedArgs.side);
      if (!sideId || !line.parsedArgs.condition) return;
      ensureInList(field.sides[sideId].conditions, line.parsedArgs.condition);
    },
    "-sideend": (line, field) => {
      const sideId = parseSideId(line.parsedArgs.side);
      if (!sideId || !line.parsedArgs.condition) return;
      removeFromList(field.sides[sideId].conditions, line.parsedArgs.condition);
    },
    win: (line, field) => {
      if (line.parsedArgs.winner) field.winner = line.parsedArgs.winner;
    },
  };

  build(parsedLogs: ParsedReplayLog): TurnState[] {
    const { lines, turns } = parsedLogs;
    const field = defaultField();
    const turnMarkersByNumber = this.getTurnMarkersByNumber(lines);

    return turns.map((turn) => {
      const turnMarkerLines = turnMarkersByNumber.get(turn.number) ?? [];
      const actions: TurnAction[] = [];

      turnMarkerLines.forEach((turnMarkerLine) => {
        this.applyLineRecursive(turnMarkerLine, lines, field, actions);
      });

      turn.lineIds.forEach((lineId) => {
        const rootLine = lines[lineId];
        this.applyLineRecursive(rootLine, lines, field, actions);
      });

      field.turnNumber = turn.number;
      return {
        turnNumber: turn.number,
        field: cloneState(field),
        actions,
      };
    });
  }

  private getTurnMarkersByNumber(
    lines: ParsedReplayLine[],
  ): Map<number, ParsedReplayLine[]> {
    const turnMarkersByNumber = new Map<number, ParsedReplayLine[]>();

    lines.forEach((line) => {
      if (line.action !== "turn") return;
      const turnNumberRaw = line.parsedArgs.turn ?? line.args[0];
      const turnNumber = Number(turnNumberRaw);
      if (!Number.isFinite(turnNumber)) return;

      const existing = turnMarkersByNumber.get(turnNumber) ?? [];
      existing.push(line);
      turnMarkersByNumber.set(turnNumber, existing);
    });

    return turnMarkersByNumber;
  }

  private applyLineRecursive(
    line: ParsedReplayLine | undefined,
    lines: ParsedReplayLine[],
    field: Field,
    actions: TurnAction[],
  ): void {
    if (!line) return;

    actions.push(this.toTurnAction(line, lines, field));
    this.applyLine(line, field);
    line.childIds.forEach((childId) => {
      this.applyLineRecursive(lines[childId], lines, field, actions);
    });
  }

  private toTurnAction(
    line: ParsedReplayLine,
    lines: ParsedReplayLine[],
    field: Field,
  ): TurnAction {
    const damageContext = this.getDamageContext(line, lines);
    const victimRef = parsePokemonRef(line.parsedArgs.pokemon);
    const attackerRef = parsePokemonRef(damageContext.attackerPokemon);
    const victimPokemon = victimRef
      ? this.resolvePokemonByRef(victimRef, field)
      : undefined;
    const attackerPokemon = attackerRef
      ? this.resolvePokemonByRef(attackerRef, field)
      : undefined;

    return {
      action: line.action,
      parsedArgs: line.parsedArgs,
      attackerSideId: damageContext.attackerSideId,
      attackerPokemon: damageContext.attackerPokemon,
      attackerName: attackerPokemon?.details
        ? attackerPokemon.details.split(",")[0].trim()
        : attackerPokemon?.species,
      move: damageContext.move,
      cause: damageContext.cause,
      indirect: damageContext.indirect,
      victimSideId: victimRef?.sideId,
      victimKey: victimPokemon?.key
        ? victimPokemon.key
        : victimRef
          ? toPositionVictimKey(victimRef)
          : undefined,
      victimName: victimPokemon?.details
        ? victimPokemon.details.split(",")[0].trim()
        : victimPokemon?.species,
    };
  }

  private getDamageContext(
    line: ParsedReplayLine,
    lines: ParsedReplayLine[],
  ): {
    attackerSideId?: SideId;
    attackerPokemon?: string;
    move?: string;
    cause?: string;
    indirect?: boolean;
  } {
    if (line.action === "move") {
      return {
        attackerSideId: parsePokemonRef(line.parsedArgs.pokemon)?.sideId,
        attackerPokemon: line.parsedArgs.pokemon,
        move: line.parsedArgs.move,
      };
    }

    if (line.parentId !== undefined) {
      const parent = lines[line.parentId];
      if (parent?.action === "move") {
        return {
          attackerSideId: parsePokemonRef(parent.parsedArgs.pokemon)?.sideId,
          attackerPokemon: parent.parsedArgs.pokemon,
          move: parent.parsedArgs.move,
        };
      }
    }

    if (line.action === "-damage") {
      const ofPokemon = (line.parsedArgs as { of?: string }).of;
      const fromCause = (line.parsedArgs as { from?: string }).from;
      const normalizedCause = fromCause?.startsWith("move: ")
        ? fromCause.slice(6)
        : fromCause;

      return {
        attackerSideId: parsePokemonRef(ofPokemon)?.sideId,
        attackerPokemon: ofPokemon,
        cause: normalizedCause,
        indirect: true,
      };
    }

    return {};
  }

  private applyLine(line: ParsedReplayLine, field: Field): void {
    this.actionFns[line.action]?.(line, field);
  }

  private getPokemonFromArgs(
    pokemonRefRaw: string | undefined,
    field: Field,
  ): Pokemon | undefined {
    const pokemonRef = parsePokemonRef(pokemonRefRaw);
    if (!pokemonRef) return undefined;
    return this.resolvePokemonByRef(pokemonRef, field);
  }

  private applySwitchLike(line: ParsedReplayLine, field: Field): void {
    const pokemonRef = parsePokemonRef(line.parsedArgs.pokemon);
    if (!pokemonRef) return;

    const side = field.sides[pokemonRef.sideId];
    const { speciesId, baseSpeciesId } = parseSpeciesMeta(
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
    if (line.parsedArgs.details) pokemon.details = line.parsedArgs.details;
    pushUnique(pokemon.detailsHistory, line.parsedArgs.details);

    const { hp, status, fainted } = parseHpStatus(line.parsedArgs.hpStatus);
    if (hp) pokemon.hp = hp;
    if (status) pokemon.status = status;
    if (fainted !== undefined) pokemon.fainted = fainted;

    side.active[pokemonRef.positionId].pokemonKey = pokemon.key;
  }

  private resolvePokemonByRef(
    pokemonRef: PokemonRef,
    field: Field,
  ): Pokemon | undefined {
    const side = field.sides[pokemonRef.sideId];

    const activeKey = side.active[pokemonRef.positionId].pokemonKey;
    if (activeKey && side.pokemon[activeKey]) return side.pokemon[activeKey];

    const direct = side.pokemon[pokemonRef.canonicalKey];
    if (direct) return direct;

    return Object.values(side.pokemon).find(
      (pokemon) => pokemon.nickname === pokemonRef.nickname,
    );
  }

  private applyHpStatus(line: ParsedReplayLine, field: Field): void {
    const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
    if (!pokemon || !line.parsedArgs.hpStatus) return;

    const { hp, status, fainted } = parseHpStatus(line.parsedArgs.hpStatus);
    if (hp) pokemon.hp = hp;
    if (status) pokemon.status = status;
    if (fainted !== undefined) pokemon.fainted = fainted;
  }

  private applyDetailsTransformLike(
    line: ParsedReplayLine,
    field: Field,
  ): void {
    const pokemon = this.getPokemonFromArgs(line.parsedArgs.pokemon, field);
    if (!pokemon) return;

    if (line.parsedArgs.details) {
      pokemon.details = line.parsedArgs.details;
      pushUnique(pokemon.detailsHistory, line.parsedArgs.details);
      const { speciesId, baseSpeciesId } = parseSpeciesMeta(
        line.parsedArgs.details,
        field.genNum,
      );
      if (speciesId) pokemon.species = speciesId;
      if (baseSpeciesId) pokemon.baseSpecies = baseSpeciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
    }
    if (line.parsedArgs.species) {
      const speciesId = toID(line.parsedArgs.species);
      const baseSpeciesId = toBaseSpeciesId(speciesId, field.genNum);
      pokemon.species = speciesId;
      pokemon.baseSpecies = baseSpeciesId;
      pushUnique(pokemon.speciesHistory, speciesId);
    }
    if (line.parsedArgs.hpStatus) {
      const { hp, status, fainted } = parseHpStatus(line.parsedArgs.hpStatus);
      if (hp) pokemon.hp = hp;
      if (status) pokemon.status = status;
      if (fainted !== undefined) pokemon.fainted = fainted;
    }
  }
}
