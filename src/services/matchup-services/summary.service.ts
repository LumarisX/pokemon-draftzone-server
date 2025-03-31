import { StatID } from "@pkmn/data";
import { DraftSpecie } from "../../classes/pokemon";

export class SummaryClass {
  constructor(
    private team: DraftSpecie[],
    private teamName?: string,
    private coach?: string
  ) {}

  private teamStatistics() {
    let stats: {
      mean: { [key in StatID | "bst"]?: number };
      median: { [key in StatID | "bst"]?: number };
      max: { [key in StatID | "bst"]?: number };
    } = {
      mean: {},
      median: {},
      max: {},
    };
    let all: { [key in StatID | "bst"]: number[] } = {
      hp: [],
      atk: [],
      def: [],
      spa: [],
      spd: [],
      spe: [],
      bst: [],
    };
    this.team.forEach((pokemon) => {
      Object.keys(pokemon.baseStats).forEach((statKey: string) => {
        const stat = statKey as StatID;
        if (pokemon.baseStats && pokemon.baseStats[stat]) {
          all[stat].push(pokemon.baseStats[stat]);
        }
      });
      all.bst.push(pokemon.bst);
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

    return stats;
  }

  toJson() {
    return {
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon, index) => ({
        ...pokemon.toClient(),
        abilities: Object.values(pokemon.abilities),
        baseStats: pokemon.baseStats,
        bst: pokemon.bst,
        index: index,
        types: pokemon.types,
      })),
      stats: this.teamStatistics(),
    };
  }
}
