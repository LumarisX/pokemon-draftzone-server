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

type AttributionBreakdown = {
  direct: string[];
  indirect: string[];
  teammate: string[];
};

type DeathAttribution = AttributionBreakdown & {
  fainted: string | true | false;
};

type ReplayPokemonAnalysis = {
  id: string;
  name: string;
  shiny?: true;
  formes?: string[];
  item?: string;
  kills: AttributionBreakdown;
  deaths: DeathAttribution;
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
  attackerName?: string;
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

function emptyAttributionBreakdown(): AttributionBreakdown {
  return { direct: [], indirect: [], teammate: [] };
}

function emptyDeathAttribution(): DeathAttribution {
  return {
    ...emptyAttributionBreakdown(),
    fainted: false,
  };
}

function emptyLuck() {
  return {
    moves: { total: 0, hits: 0, expected: 0, actual: 0 },
    crits: { total: 0, hits: 0, expected: 0, actual: 0 },
    status: { total: 0, full: 0, expected: 0, actual: 0 },
  };
}

function getHpPercent(pokemon: Pokemon | undefined): number {
  if (!pokemon) return 100;
  if (typeof pokemon.hp?.percent === "number") return pokemon.hp.percent;
  return pokemon.fainted ? 0 : 100;
}

function toDisplayName(pokemon: Pokemon): string {
  if (pokemon.details) return pokemon.details.split(",")[0].trim();
  if (pokemon.species) return pokemon.species;
  return pokemon.nickname;
}

function getStableDisplayName(pokemon: Pokemon): string {
  const latestDetail = [...pokemon.detailsHistory].reverse().find(Boolean);
  if (latestDetail) return latestDetail.split(",")[0].trim();

  const latestSpecies = [...pokemon.speciesHistory].reverse().find(Boolean);
  if (latestSpecies) return latestSpecies;

  return toDisplayName(pokemon);
}

function normalizeConditionName(
  condition: string | undefined,
): string | undefined {
  if (!condition) return undefined;
  const trimmed = condition.trim();
  const withoutMovePrefix = trimmed.startsWith("move: ")
    ? trimmed.slice(6)
    : trimmed;
  const normalized = toID(withoutMovePrefix);
  return normalized || undefined;
}

function parseSideId(side: string | undefined): string | undefined {
  if (!side) return undefined;
  const parsed = side.match(/^(p[1-4])/);
  return parsed?.[1];
}

function getAttributionBucket(
  victimSideId: string,
  attackerSideId: string | undefined,
  indirect: boolean | undefined,
): keyof AttributionBreakdown {
  if (attackerSideId && attackerSideId === victimSideId) return "teammate";
  if (indirect) return "indirect";
  return "direct";
}

function normalizeSpeciesToBase(speciesId: string, genNum?: number): string {
  const fallback = toID(speciesId);
  if (!fallback) return fallback;

  const gen = gens.get(genNum ?? 9);
  const specie = gen.species.get(speciesId);
  if (!specie?.exists) return fallback;
  return toID(specie.baseSpecies || specie.name);
}

function getActivePokemonKey(side: Side): string | undefined {
  return (
    side.active.a.pokemonKey ??
    side.active.b.pokemonKey ??
    side.active.c.pokemonKey
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
  pokemonRefRaw: string | undefined,
): Pokemon | undefined {
  const pokemonRef = parsePokemonRef(pokemonRefRaw);
  if (!pokemonRef) return undefined;
  const side = field.sides[pokemonRef.sideId as keyof typeof field.sides];
  if (!side) return undefined;

  if (pokemonRef.position) {
    const activeKey = side.active[pokemonRef.position].pokemonKey;
    if (activeKey && side.pokemon[activeKey]) {
      return side.pokemon[activeKey];
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

function getPokemonByName(
  field: Field,
  sideId: string | undefined,
  name: string | undefined,
): Pokemon | undefined {
  if (!sideId || !name) return undefined;
  const side = field.sides[sideId as keyof typeof field.sides];
  if (!side) return undefined;

  return Object.values(side.pokemon).find((pokemon) => {
    const detailName = pokemon.details?.split(",")[0].trim();
    return (
      pokemon.nickname === name ||
      detailName === name ||
      toDisplayName(pokemon) === name
    );
  });
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
    const killsByPokemon = new Map<string, AttributionBreakdown>();
    const deathsByPokemon = new Map<string, DeathAttribution>();
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

    const lastDamageByVictimKey = new Map<string, LastDamageContext>();
    const sideConditionSetters = new Map<string, LastDamageContext>();
    const attributedVictimKeys = new Set<string>();

    orderedTurnStates.forEach((turnState) => {
      turnState.actions.forEach((action) => {
        if (
          action.action === "-sidestart" &&
          action.parsedArgs.side &&
          action.parsedArgs.condition &&
          action.attackerSideId
        ) {
          const condition = normalizeConditionName(action.parsedArgs.condition);
          const sideId = parseSideId(action.parsedArgs.side);
          if (condition && sideId) {
            sideConditionSetters.set(`${sideId}|${condition}`, {
              attackerSideId: action.attackerSideId,
              attackerPokemon: action.attackerPokemon,
              attackerName: action.attackerName,
              move: action.move,
              cause: condition,
              indirect: true,
            });
          }
        }

        if (action.action === "-damage" && action.victimKey) {
          const baseContext: LastDamageContext = {
            attackerSideId: action.attackerSideId,
            attackerPokemon: action.attackerPokemon,
            attackerName: action.attackerName,
            move: action.move,
            cause: action.cause,
            indirect: action.indirect,
          };

          const hazardCondition = normalizeConditionName(action.cause);
          const hazardContext =
            !baseContext.attackerSideId &&
            action.victimSideId &&
            hazardCondition
              ? sideConditionSetters.get(
                  `${action.victimSideId}|${hazardCondition}`,
                )
              : undefined;

          const resolvedContext = hazardContext ?? baseContext;
          if (resolvedContext.attackerSideId) {
            lastDamageByVictimKey.set(action.victimKey, resolvedContext);
          } else {
            // Keep a marker context so a new unattributed damage source doesn't inherit stale attribution.
            lastDamageByVictimKey.set(action.victimKey, {
              cause: action.cause,
              indirect: action.indirect,
            });
          }
        }

        if (
          action.action !== "faint" ||
          !action.victimSideId ||
          !action.victimKey
        ) {
          return;
        }

        deathsBySide.set(
          action.victimSideId,
          (deathsBySide.get(action.victimSideId) ?? 0) + 1,
        );

        const damageContext = lastDamageByVictimKey.get(action.victimKey);
        const attackerSideId = damageContext?.attackerSideId;
        const attackerBucket = getAttributionBucket(
          action.victimSideId,
          attackerSideId,
          damageContext?.indirect,
        );
        const victimSide =
          turnState.field.sides[
            action.victimSideId as keyof typeof turnState.field.sides
          ];
        const victimPokemon = victimSide?.pokemon[action.victimKey];
        const victimName =
          getStableDisplayName(victimPokemon) ??
          action.victimName ??
          action.parsedArgs.pokemon?.split(": ").pop() ??
          "Unknown";

        const attackerRef = parsePokemonRef(damageContext?.attackerPokemon);
        const attackerPokemon =
          getPokemonByName(
            turnState.field,
            attackerSideId,
            attackerRef?.nickname ?? damageContext?.attackerName,
          ) ??
          (damageContext?.attackerPokemon
            ? getPokemonByRef(turnState.field, damageContext.attackerPokemon)
            : undefined);
        const attackerDisplayName = attackerPokemon?.key
          ? getStableDisplayName(attackerPokemon)
          : (damageContext?.attackerName ??
            damageContext?.attackerPokemon?.split(": ").pop());

        const deathRecord =
          deathsByPokemon.get(action.victimKey) ?? emptyDeathAttribution();
        if (attackerDisplayName) {
          this.pushAttribution(
            deathsByPokemon,
            action.victimKey,
            attackerBucket,
            attackerDisplayName,
          );
          deathsByPokemon.set(action.victimKey, {
            ...(deathsByPokemon.get(action.victimKey) ?? deathRecord),
            fainted: attackerDisplayName,
          });
        } else {
          deathsByPokemon.set(action.victimKey, {
            ...deathRecord,
            fainted: true,
          });
        }

        if (attackerSideId && attackerSideId !== action.victimSideId) {
          killsBySide.set(
            attackerSideId,
            (killsBySide.get(attackerSideId) ?? 0) + 1,
          );
          attributedVictimKeys.add(action.victimKey);

          if (attackerPokemon?.key) {
            this.pushAttribution(
              killsByPokemon,
              attackerPokemon.key,
              attackerBucket,
              victimName,
            );
          }
        }

        const playerIndex = sideIndexById.get(action.victimSideId) ?? 0;
        const attackerName =
          action.attackerName ??
          damageContext?.attackerName ??
          damageContext?.attackerPokemon?.split(": ").pop();
        const attackerUsername = attackerSideId
          ? turnState.field.sides[
              attackerSideId as keyof typeof turnState.field.sides
            ]?.username
          : undefined;

        let message = `${victimSide.username ?? action.victimSideId}'s ${victimName} fainted`;
        if (attackerSideId && attackerSideId === action.victimSideId) {
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

        events.push({
          player: playerIndex + 1,
          turn: turnState.turnNumber,
          message: `${message}.`,
        });
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
            currentSide.active[positionId as keyof typeof currentSide.active]
              .pokemonKey;
          const previousKey =
            previousSide?.active[positionId as keyof typeof previousSide.active]
              .pokemonKey;

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
            (sum, pokemon) => sum + (pokemon.fainted ? 0 : 1),
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

            if (!previousPokemon.fainted && currentPokemon.fainted) {
              if (attributedVictimKeys.has(pokemonKey)) {
                return;
              }

              if (attackerSideId && attackerSideId !== victimSideId) {
                killsBySide.set(
                  attackerSideId,
                  (killsBySide.get(attackerSideId) ?? 0) + 1,
                );
              }

              if (attackerActiveKey) {
                const bucket =
                  attackerSideId === victimSideId ? "teammate" : "direct";
                const victimName = getStableDisplayName(currentPokemon);
                this.pushAttribution(
                  killsByPokemon,
                  attackerActiveKey,
                  bucket,
                  victimName,
                );
              }

              // Faint events and kill totals are derived from turn action timeline.
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
        const id = normalizeSpeciesToBase(
          pokemon.baseSpecies ?? pokemon.species ?? pokemon.key,
          finalField.genNum,
        );
        const existing = groupedTeam.get(id) ?? [];
        existing.push(pokemon);
        groupedTeam.set(id, existing);
      });

      const team = [...groupedTeam.entries()].map(([id, group]) => {
        let chosenPokemon = group[0];
        let kills = emptyAttributionBreakdown();
        let deaths = emptyDeathAttribution();
        let damageDealt = emptyStatBreakdown();
        let damageTaken = emptyStatBreakdown();
        let hpRestored = 0;
        let seenActive = false;
        const moveset = new Set<string>();
        const formes = new Set<string>();

        group.forEach((pokemon) => {
          if (
            pokemon.fainted ||
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
            killsByPokemon.get(pokemon.key) ?? emptyAttributionBreakdown();
          const pokemonDeaths =
            deathsByPokemon.get(pokemon.key) ?? emptyDeathAttribution();
          const pokemonDamageDealt =
            damageDealtByPokemon.get(pokemon.key) ?? emptyStatBreakdown();
          const pokemonDamageTaken =
            damageTakenByPokemon.get(pokemon.key) ?? emptyStatBreakdown();

          kills = {
            direct: [...kills.direct, ...pokemonKills.direct],
            indirect: [...kills.indirect, ...pokemonKills.indirect],
            teammate: [...kills.teammate, ...pokemonKills.teammate],
          };
          deaths = {
            direct: [...deaths.direct, ...pokemonDeaths.direct],
            indirect: [...deaths.indirect, ...pokemonDeaths.indirect],
            teammate: [...deaths.teammate, ...pokemonDeaths.teammate],
            fainted:
              pokemonDeaths.fainted !== false
                ? pokemonDeaths.fainted
                : deaths.fainted,
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
          name: getStableDisplayName(chosenPokemon),
          formes: formes.size > 0 ? [...formes] : undefined,
          item: chosenPokemon.item,
          kills,
          deaths,
          status: chosenPokemon.fainted
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

    return {
      gametype: finalField.gameType ?? "singles",
      genNum: finalField.genNum ?? 0,
      turns: Math.max(...orderedTurnStates.map((state) => state.turnNumber), 0),
      gameTime: 0,
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

  private pushAttribution(
    map: Map<string, AttributionBreakdown>,
    key: string,
    bucket: keyof AttributionBreakdown,
    value: string,
  ): void {
    const current = map.get(key) ?? emptyAttributionBreakdown();
    map.set(key, {
      ...current,
      [bucket]: [...current[bucket], value],
    });
  }
}
