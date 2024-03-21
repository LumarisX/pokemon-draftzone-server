import { PokemonId } from "../../data/pokedex";
import {
  getBaseStats,
  getCoverage,
  getName,
} from "../data-services/pokedex.service";
import { typechart } from "./typechart.service";

export function coveragechart(
  team: {
    coverage?: {
      [key: string]: {
        ePower: number;
        id?: string;
        name?: string;
        type: string;
        stab: boolean;
        recommended?: number[] | undefined;
      }[];
    };
    pid: PokemonId;
    name: string;
  }[],
  oppteam: {
    pid: string;
    name: string;
    weak?: {};
    capt?: { tera?: string[] };
  }[],
  gen: string
) {
  for (let pokemon of team) {
    pokemon.coverage = getCoverage(pokemon.pid, gen);
    for (let category in pokemon.coverage) {
      pokemon.coverage[category].sort(function (
        x: { stab: boolean; ePower: number },
        y: { stab: boolean; ePower: number }
      ) {
        if (x.stab != y.stab) {
          if (x.stab) return -1;
          return 1;
        }
        if (x.ePower < y.ePower) return 1;
        if (x.ePower > y.ePower) return -1;
        return 0;
      });
    }
    bestCoverage(pokemon, typechart(oppteam));
    let coverage: {
      [key: string]: {
        name: string;
        type: string;
        stab: boolean;
        ePower: number;
        recommended: number[] | undefined;
      }[];
    } = {
      physical: [],
      special: [],
    };
    for (let category in pokemon.coverage) {
      for (let move of pokemon.coverage[category]) {
        coverage[category].push({
          name: getName(move.id || ""),
          type: move.type,
          stab: move.stab,
          ePower: 0,
          recommended: move.recommended,
        });
      }
    }
    pokemon.coverage = coverage;
  }
  return team;
}

function bestCoverage(
  pokemon: {
    pid: PokemonId;
    name: string;
    coverage?: {
      [key: string]: {
        ePower: number;
        id?: string;
        name?: string;
        type: string;
        stab: boolean;
        recommended?: number[];
      }[];
    };
  },
  oppTypechart: {
    team: {
      pid: string;
      name: string;
      weak?: {} | undefined;
      capt?: { tera?: string[] | undefined } | undefined;
    }[];
    teraTypes: { [key: string]: {} };
  }
) {
  const physicalCoverage = pokemon.coverage?.physical || [];
  const specialCoverage = pokemon.coverage?.special || [];
  const coverageMoves = [
    ...physicalCoverage.map((move) => ({ ...move, category: "physical" })),
    ...specialCoverage.map((move) => ({ ...move, category: "special" })),
  ];

  for (let i = 4; i < coverageMoves.length && i < 5; i++) {
    let indices = [];
    for (let j = i - 1; j >= 0; j--) {
      indices.push(j);
    }
    let best: {
      moves: {
        ePower: number;
        id?: string | undefined;
        name?: string | undefined;
        type: string;
        category: string;
        stab: boolean;
        recommended?: number[] | undefined;
      }[];
      maxEffectiveness: number;
    } = {
      maxEffectiveness: 0,
      moves: [],
    };
    for (let j = 0; j < choose(coverageMoves.length, i); j++) {
      let moves = [];
      for (let index of indices) {
        moves.push(coverageMoves[index]);
      }
      let coverageEffectiveness = teamCoverageEffectiveness(
        moves,
        oppTypechart,
        pokemon.pid
      );
      if (coverageEffectiveness > best.maxEffectiveness) {
        best.maxEffectiveness = coverageEffectiveness;
        best.moves = moves;
      }
      indices[0]++;
      for (let k = 1; k < i; k++) {
        if (indices[k - 1] > coverageMoves.length - k) {
          indices[k]++;
          for (let l = k - 1; l >= 0; l--) {
            indices[l] = indices[l + 1] + 1;
          }
        }
      }
    }
    for (let move of best.moves) {
      if (move.recommended === undefined) {
        move.recommended = [];
      }
      move.recommended.push(i);
    }
  }
}

function teamCoverageEffectiveness(
  moveArray: {
    ePower: number;
    id?: string | undefined;
    name?: string | undefined;
    category: string;
    type: string;
    stab: boolean;
  }[],
  oppTypechart: { team: any },
  userMon: string
) {
  let total = 0;
  for (let pokemon of oppTypechart.team) {
    let maxValue = 0;
    for (let move of moveArray) {
      //change out for damage calc eventually
      let stat = 1;
      if (move.category == "physical") {
        stat = getBaseStats(userMon)["atk"];
      } else {
        stat = getBaseStats(userMon)["spa"];
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
