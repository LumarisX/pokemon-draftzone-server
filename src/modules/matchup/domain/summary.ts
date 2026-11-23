import { Ruleset } from "@core/data/rulesets/rulesets";
import { roundScore, StatScores } from "@modules/data/domain/specie-stats";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ID, StatID } from "@pkmn/data";

type ScoreKey = keyof StatScores;
type StatKey = StatID | "bst" | ScoreKey;

export interface TeamStatistics {
  mean: Record<StatKey, number>;
  median: Record<StatKey, number>;
  max: Record<StatKey, number>;
  min: Record<StatKey, number>;
}

const STAT_KEYS: readonly StatID[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const SCORE_KEYS: readonly ScoreKey[] = ["power", "bulk", "speed", "overall"];
const ALL_STAT_KEYS: readonly StatKey[] = [...STAT_KEYS, "bst", ...SCORE_KEYS];

function computeStats(collections: Record<StatKey, number[]>): TeamStatistics {
  const stats: TeamStatistics = {
    mean: {} as Record<StatKey, number>,
    median: {} as Record<StatKey, number>,
    min: {} as Record<StatKey, number>,
    max: {} as Record<StatKey, number>,
  };

  for (const stat of ALL_STAT_KEYS) {
    const values = collections[stat];
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const midpoint = Math.floor(sorted.length / 2);
    const round = SCORE_KEYS.includes(stat as ScoreKey) ? roundScore : Math.round;

    stats.mean[stat] = round(sum / values.length);
    stats.median[stat] =
      sorted.length % 2 === 0
        ? round((sorted[midpoint - 1] + sorted[midpoint]) / 2)
        : sorted[midpoint];
    stats.min[stat] = sorted[0];
    stats.max[stat] = sorted[sorted.length - 1];
  }

  return stats;
}

type Scorer = (pokemon: PDZPokemon) => StatScores;

const rulesetScores: Scorer = (pokemon) => pokemon.scores;

function getFormeSummary(id: ID, ruleset: Ruleset, scoreOf: Scorer) {
  const forme = PDZPokemon.tryCreate(id, ruleset);
  if (!forme) return { id, name: id };
  return {
    id,
    name: forme.name,
    types: forme.types,
    abilities: forme.getAbilities(),
    baseStats: forme.baseStats,
    bst: forme.bst,
    scores: scoreOf(forme),
  };
}

export function summarizeTeam(
  team: PDZPokemon[],
  teamName?: string,
  coach?: string,
  scoreOf: Scorer = rulesetScores,
) {
  const scores = team.map(scoreOf);
  const collections = Object.fromEntries(
    ALL_STAT_KEYS.map((key) => [key, [] as number[]]),
  ) as Record<StatKey, number[]>;

  team.forEach((pokemon, index) => {
    for (const stat of STAT_KEYS) {
      collections[stat].push(pokemon.baseStats[stat]);
    }
    collections.bst.push(pokemon.bst);
    for (const score of SCORE_KEYS) {
      collections[score].push(scores[index][score]);
    }
  });

  return {
    teamName,
    coach,
    team: team.map((pokemon, index) => ({
      ...PokemonMapper.toClientPayload(pokemon),
      abilities: pokemon.getAbilities(),
      baseStats: pokemon.baseStats,
      bst: pokemon.bst,
      scores: scores[index],
      index,
      types: pokemon.types,
      draftFormes: pokemon.draftFormes?.map((id) =>
        getFormeSummary(id, pokemon.ruleset, scoreOf),
      ),
    })),
    stats: team.length ? computeStats(collections) : undefined,
  };
}
