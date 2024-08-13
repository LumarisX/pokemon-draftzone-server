import { StatID } from "@pkmn/data";
import { DraftSpecie } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";

export type Summary = {
  team: DraftSpecie[];
  stats: {
    mean: {
      hp?: number | undefined;
      atk?: number | undefined;
      def?: number | undefined;
      spa?: number | undefined;
      spd?: number | undefined;
      spe?: number | undefined;
    };
    median: {
      hp?: number | undefined;
      atk?: number | undefined;
      def?: number | undefined;
      spa?: number | undefined;
      spd?: number | undefined;
      spe?: number | undefined;
    };
    max: {
      hp?: number | undefined;
      atk?: number | undefined;
      def?: number | undefined;
      spa?: number | undefined;
      spd?: number | undefined;
      spe?: number | undefined;
    };
  };
};

export function summary(ruleset: Ruleset, team: DraftSpecie[]): Summary {
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
  team.forEach((pokemon) => {
    Object.entries(pokemon.baseStats).forEach((stat) =>
      all[stat[0] as StatID].push(stat[1])
    );
  });

  Object.keys(all).forEach((statKey: string) => {
    const stat = statKey as StatID;
    all[stat].sort((a, b) => b - a);
    stats.mean[stat] = Math.round(
      all[stat].reduce((x, y) => x + y, 0) / team.length
    );
    stats.median[stat] = all[stat][Math.round(all[stat].length / 2)];
    stats.max[stat] = all[stat][0];
  });
  return { team: team, stats: stats };
}
