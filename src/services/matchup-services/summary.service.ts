import { StatID } from "@pkmn/data";
import { DraftSpecies } from "../../classes/pokemon";

export class SummaryClass {
  team: DraftSpecies[];
  teamName?: string;
  constructor(team: DraftSpecies[], teamName?: string) {
    this.team = team;
    this.teamName = teamName;
  }

  stats?: {
    mean: {
      hp?: number;
      atk?: number;
      def?: number;
      spa?: number;
      spd?: number;
      spe?: number;
    };
    median: {
      hp?: number;
      atk?: number;
      def?: number;
      spa?: number;
      spd?: number;
      spe?: number;
    };
    max: {
      hp?: number;
      atk?: number;
      def?: number;
      spa?: number;
      spd?: number;
      spe?: number;
    };
  };

  statistics() {
    if (this.stats) return this.stats;
    let stats: {
      mean: { [key in StatID]?: number };
      median: { [key in StatID]?: number };
      max: { [key in StatID]?: number };
    } = {
      mean: {},
      median: {},
      max: {},
    };
    let all: { [key in StatID]: number[] } = {
      hp: [],
      atk: [],
      def: [],
      spa: [],
      spd: [],
      spe: [],
    };
    this.team.forEach((pokemon) => {
      Object.keys(all).forEach((statKey: string) => {
        const stat = statKey as StatID;
        if (pokemon.baseStats && pokemon.baseStats[stat]) {
          all[stat].push(pokemon.baseStats[stat]);
        }
      });
    });
    Object.keys(all).forEach((statKey: string) => {
      const stat = statKey as StatID;
      all[stat].sort((a, b) => b - a);
      stats.mean[stat] = Math.round(
        all[stat].reduce((x, y) => x + y, 0) / this.team.length
      );
      stats.median[stat] = all[stat][Math.round(all[stat].length / 2)];
      stats.max[stat] = all[stat][0];
    });
    this.stats = stats;
    return stats;
  }

  toJson() {
    return {
      teamName: this.teamName,
      team: this.team.map((pokemon) => ({
        ...pokemon.toPokemon(),
        abilities: Object.values(pokemon.abilities),
        baseStats: pokemon.baseStats,
        types: pokemon.types,
      })),
      stats: this.stats,
    };
  }
}
