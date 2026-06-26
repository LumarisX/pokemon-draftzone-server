import { Specie, Move, Generation, toID, ID } from "@pkmn/data";

export type ReplayData = string[];

export class ReplayLine {
  parent?: ReplayLine;
  //TODO: Turn is not being set currently
  turn?: Turn;
  raw: ReplayData;
  children: ReplayLine[] = [];

  get action(): ReplayData[0] {
    return this.raw[0];
  }
  get args() {
    return this.raw.slice(1);
  }

  constructor(lineString: string) {
    this.raw = lineString.split("|").map((e) => e.trim());
  }

  addChildLine(subLine: ReplayLine) {
    this.children.push(subLine);
    subLine.parent = this;
  }

  getTurnNumber() {
    if (this.turn) return this.turn.number;
    if (this.parent?.turn) return this.parent.turn.number;
    return undefined;
  }

  isChild(): boolean {
    return this.action.startsWith("-") || this.action === "debug";
  }
}

export class Turn {
  number;
  lines: ReplayLine[];
  constructor(turnNumber: number, lines: ReplayLine[] = []) {
    this.number = turnNumber;
    this.lines = lines;
  }

  addLine(line: ReplayLine) {
    this.lines.push(line);
    line.turn = this;
  }
}

export type LastDamage = {
  line: ReplayLine;
  damager?: Pokemon;
  type: "indirect" | "direct";
  status?: Status;
  from?: string;
};

export type Status = {
  status: string;
  setter?: Pokemon;
  name?: string;
  ended?: true;
};

export type ABILITY = string;
export type ACTION = string;
export type AMOUNT = string;
export type ATTACKER = string;
export type AVATAR = string;
export type CONDITION = string;
export type DEFENDER = string;
export type DESCRIPTION = string;
export type DETAILS = string;
export type EFFECT = string;
export type FORMATNAME = string;
export type FROMEFFECT = `[from] ${EFFECT}`;
export type GAMETYPE =
  | `singles`
  | `doubles`
  | `triples`
  | `multi`
  | `freeforall`;
export type GENNUM = string;
export type HP = `${string}/${string}`;
export type HPSTATUS = `${HP} ${STATUS}`;
export type ITEM = "item" | "";
export type MEGASTONE = string;
export type MESSAGE = string;
export type MOVE = string;
export type NUM = string;
export type NUMBER = string;
export type OFPOKEMON = `[of] ${SOURCE}`;
export type PLAYER = string;
export type POKEMON =
  | `p${PPlayer}${PPosition}: ${string}`
  | `p${PPlayer}: ${string}`;
export type POSITION = "0" | "1" | "2";
export type PPlayer = "1" | "2" | "3" | "4";
export type PPosition = "a" | "b" | "c";
export type RATING = string;
export type REASON = string;
export type REQUEST = string;
export type RULE = string;
export type SIDE = string;
export type SOURCE = POKEMON;
export type SPECIES = string;
export type STAT = string;
export type STATS = string;
export type STATUS = string;
export type TARGET = POKEMON;
export type TIMESTAMP = string;
export type TYPE = string;
export type USER = string;
export type USERNAME = string;
export type WEATHER = string;
export type MARJORACTION = OFPOKEMON | FROMEFFECT | EFFECT;
export type MoveData = ["move", POKEMON, MOVE, TARGET, ...MARJORACTION[]];
export type DamageData = ["-damage", POKEMON, HPSTATUS, ...MARJORACTION[]];
export type SetHPData = ["-sethp", POKEMON, HP, ...MARJORACTION[]];

export function getSpeciesName(details: DETAILS): string {
  return details.split(",")[0];
}

export type StatBreakdown = {
  direct: number;
  indirect: number;
  teammate: number;
};

function emptyStatBreakdown(): StatBreakdown {
  return { direct: 0, indirect: 0, teammate: 0 };
}

export class Pokemon {
  formes: { detail: string; specie: Specie }[];
  nickname: string;
  hpp: number;
  moveset: Set<Move>;
  kills: StatBreakdown = emptyStatBreakdown();
  damageDealt: StatBreakdown = emptyStatBreakdown();
  damageTaken: StatBreakdown = emptyStatBreakdown();
  calcLog: {
    damageTaken: { attacker: Pokemon; move: Move; hpDiff: number }[];
    damageDealt: { target: Pokemon; move: Move; hpDiff: number }[];
  } = {
    damageTaken: [],
    damageDealt: [],
  };
  hpRestored: number = 0;
  lastDamage?: LastDamage;
  fainted: boolean = false;
  brought: boolean;
  status: Status = { status: "healthy" };
  player: Player;
  statuses: Status[] = [];
  baseSpecie: Specie;
  gen: Generation;
  item?: string;

  constructor(
    gen: Generation,
    dString: DETAILS,
    player: Player,
    pString?: POKEMON,
    options: {
      brought?: boolean;
    } = {},
  ) {
    this.gen = gen;
    this.formes = [
      {
        detail: dString,
        specie: getSpecie(this.gen, getSpeciesName(dString)),
      },
    ];
    this.nickname = pString?.split(": ")[1] ?? "";
    this.moveset = new Set<Move>();
    this.hpp = 100;
    this.player = player;
    this.brought = options.brought ?? false;
    this.baseSpecie = getSpecie(this.gen, this.formes[0].specie.baseSpecies);
  }

  getMove(moveName: MOVE): Move {
    let move = [...this.moveset].find((move) => move.name === moveName);
    if (!move) {
      move = this.gen.dex.moves.get(moveName);
      this.moveset.add(move);
    }
    return move;
  }

  toClient() {
    const specie = this.formes[0].specie.isCosmeticForme
      ? this.baseSpecie
      : this.formes[0].specie;
    return {
      kills: this.kills,
      status: this.fainted
        ? "fainted"
        : this.brought || this.player.team.length <= this.player.teamSize
          ? "survived"
          : "brought",
      moveset: [...this.moveset].map((move) => move.name),
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      hpRestored: this.hpRestored,
      calcLog: {
        damageDealt: this.calcLog.damageDealt.map((log) => ({
          target: log.target.formes[0].detail,
          hpDiff: log.hpDiff,
          move: log.move.name,
        })),
        damageTaken: this.calcLog.damageTaken.map((log) => ({
          attacker: log.attacker.formes[0].detail,
          hpDiff: log.hpDiff,
          move: log.move.name,
        })),
      },
      id: specie.id,
      name: specie.name,
      shiny: this.formes[0].detail.includes(", shiny") || undefined,
      formes: this.baseSpecie.formes?.map((forme) => toID(forme)),
      item: this.item,
    };
  }
}

export class Player {
  username: PLAYER;
  teamSize: number = 0;
  team: Pokemon[] = [];
  turnChart: { turn: number; damage: number; remaining: number }[] = [];
  win: boolean = false;
  stats: {
    switches: number;
  } = { switches: 0 };
  luck: {
    moves: {
      total: number;
      hits: number;
      expected: number;
    };
    crits: {
      total: number;
      hits: number;
      expected: number;
    };
    status: {
      total: number;
      full: number;
      expected: number;
    };
  } = {
    moves: { total: 0, hits: 0, expected: 0 },
    crits: { total: 0, hits: 0, expected: 0 },
    status: { total: 0, full: 0, expected: 0 },
  };

  constructor(username: PLAYER) {
    this.username = username;
  }

  toClient() {
    return {
      username: this.username,
      win: this.win,
      stats: this.stats,
      total: {
        kills: this.team.reduce(
          (sum, pokemon) => sum + pokemon.kills.direct + pokemon.kills.indirect,
          0,
        ),
        deaths: this.team.reduce(
          (sum, pokemon) => sum + (pokemon.fainted ? 1 : 0),
          0,
        ),
        damageDealt: this.team.reduce(
          (sum, pokemon) =>
            sum + pokemon.damageDealt.direct + pokemon.damageDealt.indirect,
          0,
        ),
        damageTaken: this.team.reduce(
          (sum, pokemon) =>
            sum + pokemon.damageTaken.direct + pokemon.damageTaken.indirect,
          0,
        ),
      },
      turnChart: this.turnChart,
      luck: {
        moves: {
          total: this.luck.moves.total,
          hits: this.luck.moves.hits,
          expected: this.luck.moves.expected / this.luck.moves.total,
          actual: this.luck.moves.hits / this.luck.moves.total,
        },
        crits: {
          total: this.luck.crits.total,
          hits: this.luck.crits.hits,
          expected: this.luck.crits.expected / this.luck.crits.total,
          actual: this.luck.crits.hits / this.luck.crits.total,
        },
        status: {
          total: this.luck.status.total,
          full: this.luck.status.full,
          expected: this.luck.status.expected / this.luck.status.total,
          actual: this.luck.status.full / this.luck.status.total,
        },
      },
      team: this.team.map((pokemon) => pokemon.toClient()),
    };
  }
}

export class Position {
  pokemon?: Pokemon;
  statuses: Status[] = [];
}

export class Side {
  positions: {
    [key in PPosition]: Position;
  };
  statuses: Status[] = [];
  player: Player;

  constructor(player: Player) {
    this.player = player;
    this.positions = {
      a: new Position(),
      b: new Position(),
      c: new Position(),
    };
  }

  getPosition(pokemonStr: POKEMON): Position | undefined {
    const char = pokemonStr.charAt(2);
    if (char === "a" || char === "b" || char === "c")
      return this.positions[char];
    return undefined;
  }

  getPokemon(pokemonStr: POKEMON) {
    const position = this.getPosition(pokemonStr);
    if (position) return position.pokemon;
    const teamPokemon = this.player.team.find(
      (pokemon) => pokemon.nickname === pokemonStr.split(": ")[1],
    );
    if (teamPokemon) return teamPokemon;
    return undefined;
  }
}

export class Field {
  sides: Side[] = [];
  statuses: Status[] = [];
  weather: Status = { status: "none" };

  getSide(pokemonStr: POKEMON | PLAYER): Side {
    const sideIndex = +pokemonStr.charAt(1) - 1;
    if (sideIndex < 0 || sideIndex >= this.sides.length)
      throw new Error(`Invalid side index: ${sideIndex}`);
    return this.sides[sideIndex];
  }

  getPosition(pokemonStr: POKEMON) {
    return this.getSide(pokemonStr).getPosition(pokemonStr);
  }

  getSideByPlayer(player: Player): Side | undefined {
    return this.sides.find((side) => side.player === player);
  }

  getPlayerIndex(player: Player): number {
    return this.sides.findIndex((side) => side.player === player);
  }

  getPlayerByUsername(username: USERNAME): Player | undefined {
    const side = this.sides.find((side) => side.player.username === username);
    return side?.player;
  }

  getPokemon(pokemonStr: POKEMON): Pokemon {
    const side = this.getSide(pokemonStr);
    const pokemon = side.getPokemon(pokemonStr);
    if (!pokemon)
      throw new Error(`Pokemon not found for string: ${pokemonStr}`);
    return pokemon;
  }
}

// TODO: See if this can be replace/removed
export type KillString = {
  attacker?: Pokemon;
  target: Pokemon;
  reason?: string;
  indirect?: true;
};

export type Stats = {
  username: string | undefined;
  win: boolean;
  total: {
    kills: number;
    deaths: number;
    damageDealt: number;
    damageTaken: number;
  };
  stats: {
    switches: number;
  };
  turnChart: {
    turn: number;
    damage: number;
    remaining: number;
  }[];
  luck: {
    moves: {
      total: number;
      hits: number;
      expected: number;
      actual: number;
    };
    crits: {
      total: number;
      hits: number;
      expected: number;
      actual: number;
    };
    status: {
      total: number;
      full: number;
      expected: number;
      actual: number;
    };
  };
  team: {
    kills: [number, number, number];
    status: "brought" | "survived" | "fainted";
    moveset: string[];
    damageDealt: [number, number, number];
    damageTaken: [number, number, number];
    calcLog: {
      damageTaken: { attacker: string; move: string; hpDiff: number }[];
      damageDealt: { target: string; move: string; hpDiff: number }[];
    };
    hpRestored: number;
    formes: { detail: string; id: ID }[];
    baseSpecies: {
      name: string;
      id: string;
      formes?: string[];
      shiny?: boolean;
    };
  }[];
};

function getSpecie(gen: Generation, pokemonName: string): Specie {
  const specie = gen.species.get(pokemonName);
  if (!specie) throw new Error(`Species not found for details: ${pokemonName}`);
  return specie;
}

export function validateUrl(url: string): boolean {
  const pattern =
    /^(https:\/\/)?replay\.pokemonshowdown\.com\/[a-zA-Z0-9\-._~:/?#[\]\\@!$&'()*+,;=]+$/;
  return pattern.test(url);
}

export function formatUrl(url: string): string {
  if (!url) return url;
  if (!url.startsWith("https://")) {
    url = `https://${url}`;
  }
  const plainUrl = url.split("?")[0].split("#")[0];
  return plainUrl;
}
