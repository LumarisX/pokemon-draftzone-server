import { Data, Generations, toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { Field, Pokemon, Side, TurnState } from "./replay-states.service";

const replayExists: (d: Data) => boolean = (d) => d.exists === true;
const gens = new Generations(Dex, replayExists);

type StatBreakdown = {
  direct: number;
  indirect: number;
  teammate: number;
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
  calcLog: {
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
};

type ParsedPokemonRef = {
  sideId: string;
  position?: "a" | "b" | "c";
  nickname: string;
};

type LastDamageContext = {
  attackerSideId?: string;
  attackerPokemon?: string;
  move?: string;
  cause?: string;
  indirect?: boolean;
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

function emptyLuck() {
  return {
    moves: { total: 0, hits: 0, expected: 0, actual: 0 },
    crits: { total: 0, hits: 0, expected: 0, actual: 0 },
    status: { total: 0, full: 0, expected: 0, actual: 0 },
  };
}

function isPokemonFainted(pokemon: Pokemon | undefined): boolean {
  return Boolean(pokemon?.fainted);
}

function getHpPercent(pokemon: Pokemon | undefined): number {
  if (!pokemon) return 100;
  if (typeof pokemon.hp?.percent === "number") return pokemon.hp.percent;
  return isPokemonFainted(pokemon) ? 0 : 100;
}

function toDisplayName(pokemon: Pokemon): string {
  if (pokemon.details) return pokemon.details.split(",")[0].trim();
  if (pokemon.species) return pokemon.species;
  return pokemon.nickname;
}

function getActivePokemonKey(side: Side): string | undefined {
  return (
    side.positions.a.pokemon?.key ??
    side.positions.b.pokemon?.key ??
    side.positions.c.pokemon?.key
  );
}

function parsePokemonRef(
  pokemon: string | undefined,
): ParsedPokemonRef | undefined {
  if (!pokemon) return undefined;
  const parsed = pokemon.match(/^(p[1-4])([abc])?:\s*(.+)$/);
  if (!parsed) return undefined;
  return {
    sideId: parsed[1],
    position: parsed[2] as "a" | "b" | "c" | undefined,
    nickname: parsed[3]?.trim() ?? "",
  };
}

function getPokemonByRef(
  field: Field,
  pokemonRefRaw: string | Pokemon | undefined,
): Pokemon | undefined {
  if (!pokemonRefRaw) return undefined;
  if (typeof pokemonRefRaw !== "string") return pokemonRefRaw;

  const directSideMatch = pokemonRefRaw.match(/^(p[1-4]):\s*(.+)$/);
  if (directSideMatch?.[1]) {
    const side = field.sides[directSideMatch[1] as keyof typeof field.sides];
    if (side?.pokemon[pokemonRefRaw]) {
      return side.pokemon[pokemonRefRaw];
    }
  }

  const pokemonRef = parsePokemonRef(pokemonRefRaw);
  if (!pokemonRef) return undefined;
  const side = field.sides[pokemonRef.sideId as keyof typeof field.sides];
  if (!side) return undefined;

  if (pokemonRef.position) {
    const activePokemon = side.positions[pokemonRef.position].pokemon;
    if (activePokemon) {
      return activePokemon;
    }
  }

  const byNickname = Object.values(side.pokemon).find(
    (pokemon) => pokemon.nickname === pokemonRef.nickname,
  );
  if (byNickname) return byNickname;

  return Object.values(side.pokemon).find(
    (pokemon) => toDisplayName(pokemon) === pokemonRef.nickname,
  );
}

function getPokemonName(pokemonRefRaw: string | undefined): string | undefined {
  if (!pokemonRefRaw) return undefined;
  console.log(pokemonRefRaw);
  if (typeof pokemonRefRaw !== "string") return toDisplayName(pokemonRefRaw);
  return pokemonRefRaw.split(": ").pop();
}

export class ReplayAnalysisService {
  analyze(turnStates: TurnState[]): ReplayAnalysisResult {
    const orderedTurnStates = [...turnStates].sort(
      (a, b) => a.turnNumber - b.turnNumber,
    );
    const finalField = orderedTurnStates[orderedTurnStates.length - 1]?.field;
    if (!finalField) {
      return {
        gametype: "singles",
        genNum: 0,
        turns: 0,
        gameTime: 0,
        players: [],
        events: [],
      };
    }

    const playerSideIds = this.getPlayerSideIds(finalField);
    const sideIndexById = new Map(
      playerSideIds.map((sideId, i) => [sideId, i]),
    );

    const seenActiveBySide = new Map<string, Set<string>>();
    const killsBySide = new Map<string, number>();
    const deathsBySide = new Map<string, number>();
    const killsByPokemon = new Map<string, StatBreakdown>();
    const damageDealtByPokemon = new Map<string, StatBreakdown>();
    const damageTakenByPokemon = new Map<string, StatBreakdown>();
    const hpRestoredByPokemon = new Map<string, number>();
    const turnChartBySide = new Map<
      string,
      { turn: number; damage: number; remaining: number }[]
    >();
    const events: { player: number; turn: number; message: string }[] = [];

    playerSideIds.forEach((sideId) => {
      seenActiveBySide.set(sideId, new Set<string>());
      killsBySide.set(sideId, 0);
      deathsBySide.set(sideId, 0);
      turnChartBySide.set(sideId, []);
    });

    orderedTurnStates.forEach((turnState, turnIndex) => {
      const currentField = turnState.field;
      playerSideIds.forEach((victimSideId) => {
        const currentSide =
          currentField.sides[victimSideId as keyof typeof currentField.sides];

        Object.entries(currentSide.pokemon).forEach(
          ([pokemonKey, currentPokemon]) => {
            const newlyFainted =
              isPokemonFainted(currentPokemon) &&
              currentPokemon.fainted?.turnNumber === turnState.turnNumber;
            if (!newlyFainted) return;

            deathsBySide.set(
              victimSideId,
              (deathsBySide.get(victimSideId) ?? 0) + 1,
            );

            const faintContext = currentPokemon.fainted;
            const damageContext =
              faintContext?.attackerSideId || faintContext?.attackerPokemon
                ? {
                    attackerSideId: faintContext.attackerSideId,
                    attackerPokemon: faintContext.attackerPokemon,
                    move: faintContext.move,
                    cause: faintContext.cause,
                    indirect: faintContext.indirect,
                  }
                : this.getHistoryDamageContext(currentField, pokemonKey);

            const attackerSideId = damageContext?.attackerSideId;
            if (attackerSideId && attackerSideId !== victimSideId) {
              killsBySide.set(
                attackerSideId,
                (killsBySide.get(attackerSideId) ?? 0) + 1,
              );

              const attackerPokemon = getPokemonByRef(
                currentField,
                damageContext?.attackerPokemon,
              );
              if (attackerPokemon?.key) {
                this.bumpBreakdown(killsByPokemon, attackerPokemon.key, 1);
              }
            }

            const playerIndex = sideIndexById.get(victimSideId) ?? 0;
            const victimSide =
              currentField.sides[
                victimSideId as keyof typeof currentField.sides
              ];
            const victimName = toDisplayName(currentPokemon);
            const attacker = getPokemonByRef(
              currentField,
              damageContext?.attackerPokemon,
            );
            const attackerName = attacker ? toDisplayName(attacker) : undefined;
            const attackerUsername = attackerSideId
              ? currentField.sides[
                  attackerSideId as keyof typeof currentField.sides
                ]?.username
              : undefined;

            let message = `${victimSide.username ?? victimSideId}'s ${victimName} fainted`;
            if (attackerSideId && attackerSideId === victimSideId) {
              message += " itself";
              if (damageContext?.cause) {
                message += ` from ${damageContext.cause}`;
              }
            } else if (attackerSideId && attackerName && attackerUsername) {
              if (damageContext?.indirect) {
                message += " indirectly";
              }
              if (damageContext?.move) {
                message += ` from ${damageContext.move}`;
              } else if (damageContext?.cause) {
                message += ` from ${damageContext.cause}`;
              }
              message += ` by ${attackerUsername}'s ${attackerName}`;
            }
            // console.log(message);

            events.push({
              player: playerIndex + 1,
              turn: turnState.turnNumber,
              message: `${message}.`,
            });
          },
        );
      });
    });

    orderedTurnStates.forEach((turnState, turnIndex) => {
      const currentField = turnState.field;
      const previousField = orderedTurnStates[turnIndex - 1]?.field;

      playerSideIds.forEach((sideId) => {
        const currentSide =
          currentField.sides[sideId as keyof typeof currentField.sides];
        const previousSide =
          previousField?.sides[sideId as keyof typeof previousField.sides];
        const seenActive = seenActiveBySide.get(sideId);
        const chart = turnChartBySide.get(sideId);
        if (!seenActive || !chart) return;

        ["a", "b", "c"].forEach((positionId) => {
          const currentKey =
            currentSide.positions[
              positionId as keyof typeof currentSide.positions
            ].pokemon?.key;
          const previousKey =
            previousSide?.positions[
              positionId as keyof typeof previousSide.positions
            ].pokemon?.key;

          if (currentKey) seenActive.add(currentKey);
        });

        const team = Object.values(currentSide.pokemon);
        chart.push({
          turn: turnState.turnNumber,
          damage: team.reduce(
            (sum, pokemon) => sum + (100 - getHpPercent(pokemon)),
            0,
          ),
          remaining: team.reduce(
            (sum, pokemon) => sum + (isPokemonFainted(pokemon) ? 0 : 1),
            0,
          ),
        });
      });

      if (!previousField) return;

      playerSideIds.forEach((victimSideId) => {
        const currentSide =
          currentField.sides[victimSideId as keyof typeof currentField.sides];
        const previousSide =
          previousField.sides[victimSideId as keyof typeof previousField.sides];
        const attackerSideId = this.getOpponentSideId(
          victimSideId,
          playerSideIds,
        );
        const attackerSide = attackerSideId
          ? currentField.sides[
              attackerSideId as keyof typeof currentField.sides
            ]
          : undefined;
        const attackerActiveKey = attackerSide
          ? getActivePokemonKey(attackerSide)
          : undefined;

        Object.entries(currentSide.pokemon).forEach(
          ([pokemonKey, currentPokemon]) => {
            const previousPokemon = previousSide.pokemon[pokemonKey];
            if (!previousPokemon) return;

            const previousHp = getHpPercent(previousPokemon);
            const currentHp = getHpPercent(currentPokemon);

            if (currentHp < previousHp) {
              const hpLoss = previousHp - currentHp;
              this.bumpBreakdown(damageTakenByPokemon, pokemonKey, hpLoss);
              if (attackerActiveKey) {
                this.bumpBreakdown(
                  damageDealtByPokemon,
                  attackerActiveKey,
                  hpLoss,
                );
              }
            }

            if (currentHp > previousHp) {
              const heal = currentHp - previousHp;
              hpRestoredByPokemon.set(
                pokemonKey,
                (hpRestoredByPokemon.get(pokemonKey) ?? 0) + heal,
              );
            }
          },
        );
      });
    });

    if (finalField.winner) {
      const winnerSideId = playerSideIds.find(
        (sideId) =>
          finalField.sides[sideId as keyof typeof finalField.sides].username ===
          finalField.winner,
      );
      events.push({
        player: winnerSideId ? (sideIndexById.get(winnerSideId) ?? 0) : 0,
        turn: finalField.turnNumber,
        message: `${finalField.winner} wins.`,
      });
    }

    const players: ReplayPlayerAnalysis[] = playerSideIds.map((sideId) => {
      const side = finalField.sides[sideId as keyof typeof finalField.sides];
      const groupedTeam = new Map<string, Pokemon[]>();
      Object.values(side.pokemon).forEach((pokemon) => {
        const id = toID(pokemon.species);
        const existing = groupedTeam.get(id) ?? [];
        existing.push(pokemon);
        groupedTeam.set(id, existing);
      });

      const team = [...groupedTeam.entries()].map(([id, group]) => {
        let chosenPokemon = group[0];
        let kills = emptyStatBreakdown();
        let damageDealt = emptyStatBreakdown();
        let damageTaken = emptyStatBreakdown();
        let hpRestored = 0;
        let seenActive = false;
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
          const pokemonKills =
            killsByPokemon.get(pokemon.key) ?? emptyStatBreakdown();
          const pokemonDamageDealt =
            damageDealtByPokemon.get(pokemon.key) ?? emptyStatBreakdown();
          const pokemonDamageTaken =
            damageTakenByPokemon.get(pokemon.key) ?? emptyStatBreakdown();

          kills = {
            direct: kills.direct + pokemonKills.direct,
            indirect: kills.indirect + pokemonKills.indirect,
            teammate: kills.teammate + pokemonKills.teammate,
          };
          damageDealt = {
            direct: damageDealt.direct + pokemonDamageDealt.direct,
            indirect: damageDealt.indirect + pokemonDamageDealt.indirect,
            teammate: damageDealt.teammate + pokemonDamageDealt.teammate,
          };
          damageTaken = {
            direct: damageTaken.direct + pokemonDamageTaken.direct,
            indirect: damageTaken.indirect + pokemonDamageTaken.indirect,
            teammate: damageTaken.teammate + pokemonDamageTaken.teammate,
          };
          hpRestored += hpRestoredByPokemon.get(pokemon.key) ?? 0;
          seenActive =
            seenActive ||
            (seenActiveBySide.get(sideId)?.has(pokemon.key) ?? false);
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
            : seenActive || groupedTeam.size <= (side.teamSize ?? 0)
              ? "survived"
              : "brought",
          moveset: [...moveset],
          damageDealt,
          damageTaken,
          hpRestored,
          calcLog: {
            damageDealt: [],
            damageTaken: [],
          },
        } satisfies ReplayPokemonAnalysis;
      });

      return {
        username: side.username ?? sideId,
        win:
          finalField.winner !== undefined &&
          finalField.winner === (side.username ?? sideId),
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
        luck: emptyLuck(),
        team,
      };
    });

    const startTimestamp = orderedTurnStates
      .map((state) => state.field.timestampStart)
      .find((timestamp): timestamp is number => Number.isFinite(timestamp));
    const endTimestamp = [...orderedTurnStates]
      .reverse()
      .map((state) => state.field.timestampEnd)
      .find((timestamp): timestamp is number => Number.isFinite(timestamp));
    const gameTime =
      startTimestamp !== undefined && endTimestamp !== undefined
        ? Math.max(endTimestamp - startTimestamp, 0)
        : 0;

    return {
      gametype: finalField.gameType ?? "singles",
      genNum: finalField.genNum ?? 0,
      turns: Math.max(...orderedTurnStates.map((state) => state.turnNumber), 0),
      gameTime,
      players,
      events,
    };
  }

  private getPlayerSideIds(field: Field): string[] {
    return ["p1", "p2", "p3", "p4"].filter((sideId) => {
      const side = field.sides[sideId as keyof typeof field.sides];
      return Boolean(side.username) || Object.keys(side.pokemon).length > 0;
    });
  }

  private getOpponentSideId(
    sideId: string,
    sideIds: string[],
  ): string | undefined {
    return sideIds.find((candidate) => candidate !== sideId);
  }

  private bumpBreakdown(
    map: Map<string, StatBreakdown>,
    key: string,
    amount: number,
  ): void {
    const current = map.get(key) ?? emptyStatBreakdown();
    map.set(key, {
      ...current,
      direct: current.direct + amount,
    });
  }

  private getHistoryDamageContext(
    field: Field,
    victimKey: string,
  ): LastDamageContext | undefined {
    const victim = this.getPokemonByKey(field, victimKey);
    const latestDamage = victim?.damageHistory.at(-1);
    if (!latestDamage || !victim) return undefined;

    const latestAttributedDamage = [...victim.damageHistory]
      .reverse()
      .find((damage) => damage.attackerSideId || damage.attacker);
    const attributedDamage = latestAttributedDamage ?? latestDamage;
    const attackerSideId =
      attributedDamage.attackerSideId ??
      attributedDamage.attacker?.match(/^(p[1-4])/i)?.[1];

    return {
      attackerSideId,
      attackerPokemon: attributedDamage.attacker,
      move: latestDamage.move,
      cause: latestDamage.cause,
      indirect: latestDamage.indirect,
    };
  }

  private getPokemonByKey(
    field: Field,
    pokemonKey: string,
  ): Pokemon | undefined {
    const sideId = pokemonKey.match(/^(p[1-4])/)?.[1];
    if (!sideId) return undefined;
    const side = field.sides[sideId as keyof typeof field.sides];
    if (!side) return undefined;
    return side.pokemon[pokemonKey];
  }
}
