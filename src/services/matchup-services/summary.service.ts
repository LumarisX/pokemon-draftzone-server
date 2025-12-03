import { StatID } from "@pkmn/data";
import { DraftSpecie } from "../../classes/pokemon";

type StatKey = StatID | "bst";

interface TeamStatistics {
  mean: Record<StatKey, number>;
  median: Record<StatKey, number>;
  max: Record<StatKey, number>;
  min: Record<StatKey, number>;
}

export class SummaryClass {
  private static readonly STAT_KEYS: readonly StatID[] = [
    "hp",
    "atk",
    "def",
    "spa",
    "spd",
    "spe",
  ] as const;

  constructor(
    private readonly team: DraftSpecie[],
    private readonly teamName?: string,
    private readonly coach?: string
  ) {
    if (!team?.length) {
      throw new Error("Team must contain at least one Pokemon");
    }
  }

  private calculateMedian(sortedValues: readonly number[]): number {
    const midpoint = Math.floor(sortedValues.length / 2);
    return sortedValues.length % 2 === 0
      ? Math.round((sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2)
      : sortedValues[midpoint];
  }

  private teamStatistics(): TeamStatistics {
    const statCollections = this.collectStats();
    const allStatKeys = [...SummaryClass.STAT_KEYS, "bst"] as const;

    return allStatKeys.reduce(
      (stats, stat) => {
        const values = statCollections[stat];
        const sorted = [...values].sort((a, b) => a - b);
        const sum = values.reduce((acc, val) => acc + val, 0);

        stats.mean[stat] = Math.round(sum / values.length);
        stats.median[stat] = this.calculateMedian(sorted);
        stats.min[stat] = sorted[0];
        stats.max[stat] = sorted[sorted.length - 1];

        return stats;
      },
      { mean: {}, median: {}, min: {}, max: {} } as TeamStatistics
    );
  }

  private collectStats(): Record<StatKey, number[]> {
    const collections: Record<StatKey, number[]> = {
      hp: [],
      atk: [],
      def: [],
      spa: [],
      spd: [],
      spe: [],
      bst: [],
    };

    for (const pokemon of this.team) {
      this.validatePokemon(pokemon);

      for (const stat of SummaryClass.STAT_KEYS) {
        collections[stat].push(pokemon.baseStats[stat]);
      }
      collections.bst.push(pokemon.bst);
    }

    return collections;
  }

  private validatePokemon(pokemon: DraftSpecie): void {
    if (!pokemon.baseStats) {
      throw new Error(`Pokemon ${pokemon.name} is missing baseStats`);
    }

    for (const stat of SummaryClass.STAT_KEYS) {
      const value = pokemon.baseStats[stat];
      if (typeof value !== "number" || isNaN(value)) {
        throw new Error(`Invalid ${stat} value for ${pokemon.name}`);
      }
    }

    if (typeof pokemon.bst !== "number" || isNaN(pokemon.bst)) {
      throw new Error(`Invalid BST value for ${pokemon.name}`);
    }
  }

  toJson() {
    return {
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon, index) => ({
        ...pokemon.toClient(),
        abilities: pokemon.getAbilities(),
        baseStats: pokemon.baseStats,
        bst: pokemon.bst,
        index,
        types: pokemon.types,
      })),
      stats: this.teamStatistics(),
    };
  }
}
