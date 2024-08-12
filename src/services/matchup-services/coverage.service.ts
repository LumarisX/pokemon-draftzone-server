import { ID, Move } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { PokemonData } from "../../models/pokemon.schema";
import { getCoverage } from "../data-services/learnset.service";
import { getCategory } from "../data-services/move.service";
import { typechart } from "./typechart.service";
import { DraftSpecie } from "../../classes/pokemon";

export type CoverageChart = (
  | PokemonData & {
      coverage: {
        [key: string]: {
          ePower: number;
          id?: string | undefined;
          name?: string | undefined;
          type: string;
          stab: boolean;
          recommended?: number[] | undefined;
        }[];
      };
    }
)[];

export async function coveragechart(
  ruleset: Ruleset,
  team: PokemonData[],
  oppteam: PokemonData[]
): Promise<CoverageChart> {
  let result: CoverageChart = [];
  for (let pdata of team) {
    let mon = ruleset.gen.species.get(pdata.pid);
    if (!mon) continue;
    let pokemon: PokemonData & {
      coverage: {
        physical: (Move & {
          stab: boolean;
          ePower: number;
        })[];
        special: (Move & {
          stab: boolean;
          ePower: number;
        })[];
      };
    } = {
      ...pdata,
      coverage: await getCoverage(mon, ruleset),
    };
    pokemon.coverage["physical"].sort((x, y) => {
      if (x.stab != y.stab) {
        if (x.stab) return -1;
        return 1;
      }
      if (x.ePower < y.ePower) return 1;
      if (x.ePower > y.ePower) return -1;
      return 0;
    });
    pokemon.coverage["special"].sort((x, y) => {
      if (x.stab != y.stab) {
        if (x.stab) return -1;
        return 1;
      }
      if (x.ePower < y.ePower) return 1;
      if (x.ePower > y.ePower) return -1;
      return 0;
    });

    bestCoverage(ruleset, pokemon, typechart(ruleset, oppteam));
    let coverage: {
      [key: string]: {
        name: string;
        type: string;
        stab: boolean;
        ePower: number;
        recommended?: true;
      }[];
    } = {
      physical: [],
      special: [],
    };

    for (let move of pokemon.coverage["physical"]) {
      coverage["physcical"].push({
        name: move.name,
        type: move.type,
        stab: move.stab,
        ePower: move.ePower,
        recommended: move.recommended,
      });
    }
    for (let move of pokemon.coverage["special"]) {
      coverage["special"].push({
        name: move.name,
        type: move.type,
        stab: move.stab,
        ePower: move.ePower,
        recommended: move.recommended,
      });
    }

    pokemon.coverage = coverage;
    result.push(pokemon);
  }
  return result;
}

function bestCoverage(
  pokemon: DraftSpecie,
  oppTypechart: {
    team: {
      pid: ID;
      name: string;
      weak?: {} | undefined;
      capt?: { tera?: string[] | undefined } | undefined;
    }[];
    teraTypes: { [key: string]: {} };
  }
) {
  const physicalCoverage = pokemon.coverage?.physical || [];
  const specialCoverage = pokemon.coverage?.special || [];

  let best: {
    moves: {
      ePower: number;
      id: ID;
      name?: string | undefined;
      type: string;
      stab: boolean;
      recommended?: true;
    }[];
    maxEffectiveness: number;
  } = {
    maxEffectiveness: 0,
    moves: [],
  };
  let indices = [3, 2, 1, 0];
  for (
    let j = 0;
    j < choose(physicalCoverage.length + specialCoverage.length, 4);
    j++
  ) {
    let moves = [];
    for (let index of indices) {
      if (index < physicalCoverage.length) {
        moves.push(physicalCoverage[index]);
      } else {
        moves.push(specialCoverage[index - physicalCoverage.length]);
      }
    }
    let coverageEffectiveness = teamCoverageEffectiveness(
      ruleset,
      pokemon.pid,
      moves,
      oppTypechart
    );
    if (coverageEffectiveness > best.maxEffectiveness) {
      best.maxEffectiveness = coverageEffectiveness;
      best.moves = moves;
    }
    indices[0]++;
    for (let k = 1; k < 4; k++) {
      if (
        indices[k - 1] >
        physicalCoverage.length + specialCoverage.length - k
      ) {
        indices[k]++;
        for (let l = k - 1; l >= 0; l--) {
          indices[l] = indices[l + 1] + 1;
        }
      }
    }
  }
  for (let move of best.moves) {
    move.recommended = true;
  }
  return best.moves;
}

function teamCoverageEffectiveness(
  ruleset: Ruleset,
  userMon: ID,
  moveArray: {
    ePower: number;
    id: ID;
    name?: string | undefined;
    type: string;
    stab: boolean;
  }[],
  oppTypechart: { team: any }
) {
  let total = 0;
  for (let pokemon of oppTypechart.team) {
    let maxValue = 0;
    for (let move of moveArray) {
      //change out for damage calc eventually
      let stat = 1;
      if (getCategory(ruleset, move.id) == "Physical") {
        stat = getBaseStats(ruleset, userMon)["atk"];
      } else {
        stat = getBaseStats(ruleset, userMon)["spa"];
      }
      let value = move.ePower * pokemon.weak[move.type] * stat;
      if (move.stab) {
        value = value * 1.5;
      }
      if (maxValue < value) maxValue = value;
    }
    total += maxValue;
  }
  return total;
}

function choose(n: number, r: number) {
  let total = 1;
  for (let i = n; i > n - r; i--) {
    total = total * i;
  }
  for (let i = 1; i <= r; i++) {
    total = total / i;
  }
  return total;
}
