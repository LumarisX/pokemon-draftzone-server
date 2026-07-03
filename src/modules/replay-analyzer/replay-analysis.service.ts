import { Injectable } from "@nestjs/common";
import { Data, Generations, toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import {
  DamageData,
  FaintState,
  Pokemon,
  PokemonKey,
  ReplayBuildResult,
  Side,
} from "./replay-states.service";

const PLAYER_SIDE_IDS = ["p1", "p2", "p3", "p4"] as const;
type FieldSideId = (typeof PLAYER_SIDE_IDS)[number];

const replayExists: (d: Data) => boolean = (d) => d.exists === true;
const gens = new Generations(Dex, replayExists);

function toSpeciesGroupId(
  species: string | undefined,
  genNum: number | undefined,
): string {
  const id = toID(species);
  if (!id) return id;
  const specie = gens.get(genNum ?? 9).species.get(id);
  if (specie?.isCosmeticForme) return toID(specie.baseSpecies);
  return id;
}

type StatBreakdown = {
  direct: number;
  indirect: number;
  teammate: number;
};

type CalcLog = {
  damageDealt: {
    target: string;
    hpDiff: number;
    move: string;
  }[];
  damageTaken: {
    attacker: string;
    hpDiff: number;
    move: string;
  }[];
};

type ReplayPokemonAnalysis = {
  id: string;
  name: string;
  shiny?: true;
  formes?: string[];
  item?: string;
  kills: StatBreakdown;
  status: "brought" | "survived" | "fainted";
  moveset: string[];
  damageDealt: StatBreakdown;
  damageTaken: StatBreakdown;
  hpRestored: number;
  calcLog: CalcLog;
};

type LuckStats = {
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

type ReplayPlayerAnalysis = {
  username: string;
  win: boolean;
  stats: {
    switches: number;
  };
  total: {
    kills: number;
    deaths: number;
    damageDealt: number;
    damageTaken: number;
  };
  turnChart: {
    turn: number;
    damage: number;
    remaining: number;
  }[];
  luck: LuckStats;
  team: ReplayPokemonAnalysis[];
};

export type ReplayAnalysisResult = {
  gametype: string;
  genNum: number;
  turns: number;
  gameTime: number;
  players: ReplayPlayerAnalysis[];
  events: { player: number; turn: number; message: string }[];
};

function emptyStatBreakdown(): StatBreakdown {
  return { direct: 0, indirect: 0, teammate: 0 };
}

function emptyCalcLog(): CalcLog {
  return { damageDealt: [], damageTaken: [] };
}

function isPokemonFainted(pokemon: Pokemon | undefined): boolean {
  return Boolean(pokemon?.fainted);
}

function toDisplayName(pokemon: Pokemon): string {
  if (pokemon.details) return pokemon.details.split(",")[0].trim();
  if (pokemon.species) return pokemon.species;
  return pokemon.nickname;
}

function addBreakdown(target: StatBreakdown, source: StatBreakdown): void {
  target.direct += source.direct;
  target.indirect += source.indirect;
  target.teammate += source.teammate;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

@Injectable()
export class ReplayAnalysisService {
  analyze(build: ReplayBuildResult): ReplayAnalysisResult {
    const field = build.field;
    const playerSideIds = PLAYER_SIDE_IDS.filter((sideId) => {
      const side = field.sides[sideId];
      return Boolean(side.username) || Object.keys(side.pokemon).length > 0;
    });
    const sideIndexById = new Map<string, number>(
      playerSideIds.map((sideId, i) => [sideId, i]),
    );

    const pokemonByKey = new Map<PokemonKey, Pokemon>();
    playerSideIds.forEach((sideId) => {
      Object.values(field.sides[sideId].pokemon).forEach((pokemon) =>
        pokemonByKey.set(pokemon.key, pokemon),
      );
    });

    const killsByPokemon = new Map<PokemonKey, StatBreakdown>();
    const damageDealtByPokemon = new Map<PokemonKey, StatBreakdown>();
    const damageTakenByPokemon = new Map<PokemonKey, StatBreakdown>();
    const hpRestoredByPokemon = new Map<PokemonKey, number>();
    const calcLogByPokemon = new Map<PokemonKey, CalcLog>();
    const killsBySide = new Map<string, number>();
    const deathsBySide = new Map<string, number>();
    const events: { player: number; turn: number; message: string }[] = [];

    playerSideIds.forEach((sideId) => {
      killsBySide.set(sideId, 0);
      deathsBySide.set(sideId, 0);
    });

    playerSideIds.forEach((sideId) => {
      Object.values(field.sides[sideId].pokemon).forEach((victim) => {
        victim.damageHistory.forEach((event) =>
          this.applyDamageEvent(victim, event, pokemonByKey, {
            damageDealtByPokemon,
            damageTakenByPokemon,
            calcLogByPokemon,
          }),
        );

        const hpRestored = victim.healHistory.reduce(
          (sum, heal) => sum + heal.amount,
          0,
        );
        if (hpRestored > 0) hpRestoredByPokemon.set(victim.key, hpRestored);

        victim.faints.forEach((faint) => {
          deathsBySide.set(sideId, (deathsBySide.get(sideId) ?? 0) + 1);

          const attacker = faint.attackerPokemon
            ? pokemonByKey.get(faint.attackerPokemon)
            : undefined;
          const attackerSideId = attacker?.sideId ?? faint.attackerSideId;

          if (attackerSideId && attackerSideId !== victim.sideId) {
            killsBySide.set(
              attackerSideId,
              (killsBySide.get(attackerSideId) ?? 0) + 1,
            );
            if (attacker) {
              this.bumpBreakdown(
                killsByPokemon,
                attacker.key,
                faint.indirect ? "indirect" : "direct",
                1,
              );
            }
          } else if (attacker && attacker.key !== victim.key) {
            this.bumpBreakdown(killsByPokemon, attacker.key, "teammate", 1);
          }

          events.push({
            player: (sideIndexById.get(victim.sideId) ?? 0) + 1,
            turn: faint.turnNumber,
            message: `${this.buildFaintMessage(victim, faint, attacker, field.sides)}.`,
          });
        });
      });
    });

    field.messages.forEach((message) => {
      events.push({
        player: 0,
        turn: message.turnNumber,
        message: message.message,
      });
    });

    events.sort((a, b) => a.turn - b.turn);

    if (field.winner) {
      const winnerSideId = playerSideIds.find(
        (sideId) => field.sides[sideId].username === field.winner,
      );
      events.push({
        player: winnerSideId ? (sideIndexById.get(winnerSideId) ?? 0) + 1 : 0,
        turn: field.turnNumber,
        message: `${field.winner} wins.`,
      });
    } else if (field.tie) {
      events.push({
        player: 0,
        turn: field.turnNumber,
        message: "The battle ended in a tie.",
      });
    }

    const turnChartBySide = new Map<
      string,
      { turn: number; damage: number; remaining: number }[]
    >();
    playerSideIds.forEach((sideId) => turnChartBySide.set(sideId, []));
    build.turns.forEach((snapshot) => {
      playerSideIds.forEach((sideId) => {
        const team = Object.values(snapshot.sides[sideId] ?? {});
        turnChartBySide.get(sideId)?.push({
          turn: snapshot.turnNumber,
          damage: team.reduce((sum, mon) => sum + (100 - mon.hpPercent), 0),
          remaining: team.reduce((sum, mon) => sum + (mon.fainted ? 0 : 1), 0),
        });
      });
    });

    const players: ReplayPlayerAnalysis[] = playerSideIds.map((sideId) => {
      const side = field.sides[sideId];
      const team = this.buildTeamAnalysis(side, field.genNum, {
        killsByPokemon,
        damageDealtByPokemon,
        damageTakenByPokemon,
        hpRestoredByPokemon,
        calcLogByPokemon,
      });

      return {
        username: side.username ?? sideId,
        win:
          field.winner !== undefined &&
          field.winner === (side.username ?? sideId),
        stats: {
          switches: side.stats.switches,
        },
        total: {
          kills: killsBySide.get(sideId) ?? 0,
          deaths: deathsBySide.get(sideId) ?? 0,
          damageDealt: team.reduce(
            (sum, pokemon) =>
              sum + pokemon.damageDealt.direct + pokemon.damageDealt.indirect,
            0,
          ),
          damageTaken: team.reduce(
            (sum, pokemon) =>
              sum + pokemon.damageTaken.direct + pokemon.damageTaken.indirect,
            0,
          ),
        },
        turnChart: turnChartBySide.get(sideId) ?? [],
        luck: this.aggregateLuck(side),
        team,
      };
    });

    const gameTime =
      field.timestampStart !== undefined && field.timestampEnd !== undefined
        ? Math.max(field.timestampEnd - field.timestampStart, 0)
        : 0;

    return {
      gametype: field.gameType ?? "singles",
      genNum: field.genNum ?? 0,
      turns: Math.max(...build.turns.map((turn) => turn.turnNumber), 0),
      gameTime,
      players,
      events,
    };
  }

  private applyDamageEvent(
    victim: Pokemon,
    event: DamageData,
    pokemonByKey: Map<PokemonKey, Pokemon>,
    aggregates: {
      damageDealtByPokemon: Map<PokemonKey, StatBreakdown>;
      damageTakenByPokemon: Map<PokemonKey, StatBreakdown>;
      calcLogByPokemon: Map<PokemonKey, CalcLog>;
    },
  ): void {
    const amount = event.damageTaken;
    if (amount <= 0) return;

    this.bumpBreakdown(
      aggregates.damageTakenByPokemon,
      victim.key,
      event.indirect ? "indirect" : "direct",
      amount,
    );

    const attacker = event.attacker
      ? pokemonByKey.get(event.attacker)
      : undefined;
    if (!attacker || attacker.key === victim.key) return;

    const bucket =
      attacker.sideId === victim.sideId
        ? "teammate"
        : event.indirect
          ? "indirect"
          : "direct";
    this.bumpBreakdown(
      aggregates.damageDealtByPokemon,
      attacker.key,
      bucket,
      amount,
    );

    if (!event.indirect && event.move) {
      this.getCalcLog(aggregates.calcLogByPokemon, victim.key).damageTaken.push(
        {
          attacker: toDisplayName(attacker),
          move: event.move,
          hpDiff: amount,
        },
      );
      this.getCalcLog(
        aggregates.calcLogByPokemon,
        attacker.key,
      ).damageDealt.push({
        target: toDisplayName(victim),
        move: event.move,
        hpDiff: amount,
      });
    }
  }

  private buildFaintMessage(
    victim: Pokemon,
    faint: FaintState,
    attacker: Pokemon | undefined,
    sides: Record<FieldSideId, Side>,
  ): string {
    const victimSide = sides[victim.sideId as FieldSideId];
    const victimName = toDisplayName(victim);
    let message = `${victimSide?.username ?? victim.sideId}'s ${victimName} fainted`;

    if (attacker && attacker.key === victim.key) {
      message += " itself";
      if (faint.cause) message += ` from ${faint.cause}`;
      return message;
    }

    if (attacker) {
      const attackerName = toDisplayName(attacker);
      const attackerUsername =
        sides[attacker.sideId as FieldSideId]?.username ?? attacker.sideId;
      if (faint.indirect) message += " indirectly";
      if (faint.move) {
        message += ` from ${faint.move}`;
      } else if (faint.cause) {
        message += ` from ${faint.cause}`;
      }
      message += ` by ${attackerUsername}'s ${attackerName}`;
    }
    return message;
  }

  private buildTeamAnalysis(
    side: Side,
    genNum: number | undefined,
    aggregates: {
      killsByPokemon: Map<PokemonKey, StatBreakdown>;
      damageDealtByPokemon: Map<PokemonKey, StatBreakdown>;
      damageTakenByPokemon: Map<PokemonKey, StatBreakdown>;
      hpRestoredByPokemon: Map<PokemonKey, number>;
      calcLogByPokemon: Map<PokemonKey, CalcLog>;
    },
  ): ReplayPokemonAnalysis[] {
    const groupedTeam = new Map<string, Pokemon[]>();
    Object.values(side.pokemon).forEach((pokemon) => {
      const id = toSpeciesGroupId(pokemon.species, genNum);
      const existing = groupedTeam.get(id) ?? [];
      existing.push(pokemon);
      groupedTeam.set(id, existing);
    });

    return [...groupedTeam.entries()].map(([id, group]) => {
      let chosenPokemon = group[0];
      const kills = emptyStatBreakdown();
      const damageDealt = emptyStatBreakdown();
      const damageTaken = emptyStatBreakdown();
      const calcLog = emptyCalcLog();
      let hpRestored = 0;
      let everActive = false;
      const moveset = new Set<string>();
      const formes = new Set<string>();

      group.forEach((pokemon) => {
        if (
          isPokemonFainted(pokemon) ||
          pokemon.moveset.length > chosenPokemon.moveset.length
        ) {
          chosenPokemon = pokemon;
        }

        pokemon.moveset.forEach((move) => moveset.add(move));
        pokemon.speciesHistory.forEach((speciesId) => {
          const normalized = toID(speciesId);
          if (normalized) formes.add(normalized);
        });
        if (pokemon.species) formes.add(toID(pokemon.species));

        addBreakdown(
          kills,
          aggregates.killsByPokemon.get(pokemon.key) ?? emptyStatBreakdown(),
        );
        addBreakdown(
          damageDealt,
          aggregates.damageDealtByPokemon.get(pokemon.key) ??
            emptyStatBreakdown(),
        );
        addBreakdown(
          damageTaken,
          aggregates.damageTakenByPokemon.get(pokemon.key) ??
            emptyStatBreakdown(),
        );
        hpRestored += aggregates.hpRestoredByPokemon.get(pokemon.key) ?? 0;
        everActive = everActive || Boolean(pokemon.everActive);

        const pokemonCalcLog = aggregates.calcLogByPokemon.get(pokemon.key);
        if (pokemonCalcLog) {
          calcLog.damageDealt.push(...pokemonCalcLog.damageDealt);
          calcLog.damageTaken.push(...pokemonCalcLog.damageTaken);
        }
      });

      return {
        id,
        name: toDisplayName(chosenPokemon),
        shiny: group.some((pokemon) => pokemon.shiny) ? true : undefined,
        formes: formes.size > 0 ? [...formes] : undefined,
        item: chosenPokemon.item?.raw,
        kills,
        status: isPokemonFainted(chosenPokemon)
          ? "fainted"
          : everActive || groupedTeam.size <= (side.teamSize ?? 0)
            ? "survived"
            : "brought",
        moveset: [...moveset],
        damageDealt,
        damageTaken,
        hpRestored,
        calcLog,
      } satisfies ReplayPokemonAnalysis;
    });
  }

  private aggregateLuck(side: Side): LuckStats {
    const moves = { total: 0, hits: 0, expectedSum: 0 };
    const crits = { total: 0, hits: 0, expectedSum: 0 };
    const status = { total: 0, full: 0, expectedSum: 0 };

    Object.values(side.pokemon).forEach((pokemon) => {
      pokemon.missHistory.forEach((event) => {
        moves.total++;
        if (event.hit) moves.hits++;
        moves.expectedSum += event.expected;
      });
      pokemon.critHistory.forEach((event) => {
        crits.total++;
        if (event.hit) crits.hits++;
        crits.expectedSum += event.expected;
      });
      pokemon.fullParalysisHistory.forEach((event) => {
        status.total++;
        if (event.fullyParalyzed) status.full++;
        status.expectedSum += event.expected;
      });
    });

    return {
      moves: {
        total: moves.total,
        hits: moves.hits,
        expected: ratio(moves.expectedSum, moves.total),
        actual: ratio(moves.hits, moves.total),
      },
      crits: {
        total: crits.total,
        hits: crits.hits,
        expected: ratio(crits.expectedSum, crits.total),
        actual: ratio(crits.hits, crits.total),
      },
      status: {
        total: status.total,
        full: status.full,
        expected: ratio(status.expectedSum, status.total),
        actual: ratio(status.full, status.total),
      },
    };
  }

  private bumpBreakdown(
    map: Map<PokemonKey, StatBreakdown>,
    key: PokemonKey,
    bucket: keyof StatBreakdown,
    amount: number,
  ): void {
    const current = map.get(key) ?? emptyStatBreakdown();
    current[bucket] += amount;
    map.set(key, current);
  }

  private getCalcLog(map: Map<PokemonKey, CalcLog>, key: PokemonKey): CalcLog {
    const existing = map.get(key);
    if (existing) return existing;
    const created = emptyCalcLog();
    map.set(key, created);
    return created;
  }
}
