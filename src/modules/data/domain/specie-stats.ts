import { Specie, StatID, StatsTable } from "@pkmn/data";

export type StatScores = {
  power: number;
  bulk: number;
  speed: number;
  overall: number;
};

export type ScorePool = {
  power: number[];
  bulk: number[];
  speed: number[];
  overall: number[];
};

export type ScoreEntry = {
  baseStats: StatsTable;
  abilities: readonly string[];
};

type PoolSpecie = Pick<
  Specie,
  "baseStats" | "abilities" | "nfe" | "battleOnly" | "forme" | "baseSpecies"
>;

type StatModifier = Partial<Record<StatID, number>>;

export const ABILITY_STAT_MODIFIERS: Readonly<Record<string, StatModifier>> = {
  "Huge Power": { atk: 2 },
  "Pure Power": { atk: 2 },
  Truant: { atk: 0.5, spa: 0.5 },
  "Slow Start": { atk: 0.5, spe: 0.5 },
};

export const SCORE_MAX = 9.999;
const SCORE_PRECISION = 1000;
const POWER_NORM = 4;
const OVERALL_NORM = 1.5;

export function getBST(specie: Specie) {
  return Object.values(specie.baseStats).reduce((sum, stat) => stat + sum);
}

export function powerValue(stats: StatsTable): number {
  return (
    (stats.atk ** POWER_NORM + stats.spa ** POWER_NORM) ** (1 / POWER_NORM)
  );
}

export function bulkValue(stats: StatsTable): number {
  return (stats.hp + stats.def + stats.spd) / 3;
}

export function speedValue(stats: StatsTable): number {
  return stats.spe;
}

function applyModifier(
  stats: StatsTable,
  modifier: StatModifier | undefined,
): StatsTable {
  if (!modifier) return stats;
  const adjusted = { ...stats };
  for (const [stat, factor] of Object.entries(modifier) as [StatID, number][]) {
    adjusted[stat] = stats[stat] * factor;
  }
  return adjusted;
}

function strength(stats: StatsTable): number {
  return powerValue(stats) + bulkValue(stats) + speedValue(stats);
}

export function effectiveStats(entry: ScoreEntry): StatsTable {
  const options = entry.abilities.length
    ? entry.abilities.map((ability) =>
        applyModifier(entry.baseStats, ABILITY_STAT_MODIFIERS[ability]),
      )
    : [entry.baseStats];
  return options.reduce((best, option) =>
    strength(option) > strength(best) ? option : best,
  );
}

function countBelow(
  sorted: readonly number[],
  value: number,
  inclusive: boolean,
): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value || (inclusive && sorted[mid] === value))
      lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function rankIn(sorted: readonly number[], value: number): number {
  if (!sorted.length) return 0.5;
  const below = countBelow(sorted, value, false);
  const atOrBelow = countBelow(sorted, value, true);
  return (below + atOrBelow) / 2 / sorted.length;
}

function weighted(power: number, bulk: number, speed: number): number {
  const sum =
    power ** OVERALL_NORM + bulk ** OVERALL_NORM + speed ** OVERALL_NORM;
  return (sum / 3) ** (1 / OVERALL_NORM);
}

const ascending = (values: number[]) => values.sort((a, b) => a - b);

export function buildScorePool(entries: readonly ScoreEntry[]): ScorePool {
  const stats = entries.map(effectiveStats);
  const power = ascending(stats.map(powerValue));
  const bulk = ascending(stats.map(bulkValue));
  const speed = ascending(stats.map(speedValue));
  const overall = ascending(
    stats.map((entry) =>
      weighted(
        rankIn(power, powerValue(entry)),
        rankIn(bulk, bulkValue(entry)),
        rankIn(speed, speedValue(entry)),
      ),
    ),
  );
  return { power, bulk, speed, overall };
}

export function isFullyEvolved(specie: PoolSpecie): boolean {
  return (
    !specie.nfe &&
    !specie.battleOnly &&
    specie.forme !== "Totem" &&
    specie.baseSpecies !== "Pichu"
  );
}

export type ScoredSpecie = Pick<Specie, "name" | "baseStats" | "abilities">;

export type FormeSource = {
  get(name: string): Pick<Specie, "baseStats"> | undefined;
};

export const BATTLE_FORMES: Readonly<Record<string, string>> = {
  Palafin: "Palafin-Hero",
  Terapagos: "Terapagos-Terastal",
  Wishiwashi: "Wishiwashi-School",
};

export function battleStats(
  specie: ScoredSpecie,
  species: FormeSource,
): StatsTable {
  const forme = BATTLE_FORMES[specie.name];
  return (forme && species.get(forme)?.baseStats) || specie.baseStats;
}

export function scoreEntry(
  specie: ScoredSpecie,
  species: FormeSource,
  bannedAbilities: readonly string[] = [],
): ScoreEntry {
  const abilities = Object.values(specie.abilities).filter(
    (ability): ability is string =>
      !!ability && !bannedAbilities.includes(ability),
  );
  return { baseStats: battleStats(specie, species), abilities };
}

const rulesetPools = new WeakMap<object, ScorePool>();

export function rulesetScorePool(ruleset: {
  species: Iterable<PoolSpecie & ScoredSpecie> & FormeSource;
}): ScorePool {
  const cached = rulesetPools.get(ruleset);
  if (cached) return cached;
  const entries = Array.from(ruleset.species)
    .filter(isFullyEvolved)
    .map((specie) => scoreEntry(specie, ruleset.species));
  const pool = buildScorePool(entries);
  rulesetPools.set(ruleset, pool);
  return pool;
}

export const roundScore = (value: number) =>
  Math.round(value * SCORE_PRECISION) / SCORE_PRECISION;

const toScore = (share: number) => roundScore(SCORE_MAX * share);

export function getScores(entry: ScoreEntry, pool: ScorePool): StatScores {
  const stats = effectiveStats(entry);
  const power = rankIn(pool.power, powerValue(stats));
  const bulk = rankIn(pool.bulk, bulkValue(stats));
  const speed = rankIn(pool.speed, speedValue(stats));
  return {
    power: toScore(power),
    bulk: toScore(bulk),
    speed: toScore(speed),
    overall: toScore(rankIn(pool.overall, weighted(power, bulk, speed))),
  };
}
