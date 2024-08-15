import { DraftSpecies } from "../../classes/pokemon";
import { PokemonData } from "../../models/pokemon.schema";
import { getMoveName } from "../data-services/move.service";
import { getCoverage } from "../data-services/pokedex.service";

export type Coveragechart = (
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
  team: DraftSpecies[],
  oppteam: DraftSpecies[]
): Promise<Coveragechart> {
  let result: Coveragechart = [];
  for (let pokemon of team) {
    let data: {
      species: DraftSpecies;
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
    } = {
      species: pokemon,
      coverage: await getCoverage(pokemon),
    };
    for (let category in data.coverage) {
      data.coverage[category as keyof typeof data.coverage].sort(function (
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
    // bestCoverage(pokemon, typechart(oppteam));
    // let coverage: {
    //   [key: string]: {
    //     name: string;
    //     type: string;
    //     stab: boolean;
    //     ePower: number;
    //     recommended?: true;
    //   }[];
    // } = {
    //   physical: [],
    //   special: [],
    // };
    // for (let category in data.coverage) {
    //   for (let move of data.coverage[category as keyof typeof data.coverage]) {
    //     coverage[category].push({
    //       name: getMoveName(pokemon.ruleset, move.id || ""),
    //       type: move.type,
    //       stab: move.stab,
    //       ePower: move.ePower,
    //       recommended: move.recommended,
    //     });
    //   }
    // }
    // data.coverage = coverage;
    result.push({
      ...data.species.toPokemonData(),
      coverage: data.coverage,
    });
  }
  return result;
}

// function bestCoverage(
//   pokemon: {
//     id: ID;
//     name: string;
//     coverage?: {
//       [key: string]: {
//         ePower: number;
//         id: ID;
//         name?: string;
//         type: string;
//         stab: boolean;
//         recommended?: true;
//       }[];
//     };
//   },
//   oppTypechart: {
//     team: {
//       id: ID;
//       name: string;
//       weak?: {} | undefined;
//       capt?: { tera?: string[] | undefined } | undefined;
//     }[];
//     teraTypes: { [key: string]: {} };
//   }
// ) {
//   const physicalCoverage = pokemon.coverage?.physical || [];
//   const specialCoverage = pokemon.coverage?.special || [];

//   let best: {
//     moves: {
//       ePower: number;
//       id: ID;
//       name?: string | undefined;
//       type: string;
//       stab: boolean;
//       recommended?: true;
//     }[];
//     maxEffectiveness: number;
//   } = {
//     maxEffectiveness: 0,
//     moves: [],
//   };
//   let indices = [3, 2, 1, 0];
//   for (
//     let j = 0;
//     j < choose(physicalCoverage.length + specialCoverage.length, 4);
//     j++
//   ) {
//     let moves = [];
//     for (let index of indices) {
//       if (index < physicalCoverage.length) {
//         moves.push(physicalCoverage[index]);
//       } else {
//         moves.push(specialCoverage[index - physicalCoverage.length]);
//       }
//     }
//     let coverageEffectiveness = teamCoverageEffectiveness(
//       pokemon,
//       moves,
//       oppTypechart
//     );
//     if (coverageEffectiveness > best.maxEffectiveness) {
//       best.maxEffectiveness = coverageEffectiveness;
//       best.moves = moves;
//     }
//     indices[0]++;
//     for (let k = 1; k < 4; k++) {
//       if (
//         indices[k - 1] >
//         physicalCoverage.length + specialCoverage.length - k
//       ) {
//         indices[k]++;
//         for (let l = k - 1; l >= 0; l--) {
//           indices[l] = indices[l + 1] + 1;
//         }
//       }
//     }
//   }
//   for (let move of best.moves) {
//     move.recommended = true;
//   }
//   return best.moves;
// }

// function teamCoverageEffectiveness(
//   pokemon: DraftSpecies,
//   moveArray: {
//     ePower: number;
//     id: ID;
//     name?: string | undefined;
//     type: string;
//     stab: boolean;
//   }[],
//   oppTypechart: { team: any }
// ) {
//   let total = 0;
//   for (let oppPokemon of oppTypechart.team) {
//     let maxValue = 0;
//     for (let move of moveArray) {
//       //change out for damage calc eventually
//       let stat = 1;
//       if (getCategory(pokemon.ruleset, move.id) == "Physical") {
//         stat = pokemon.baseStats.atk;
//       } else {
//         stat = pokemon.baseStats.spa;
//       }
//       let value = move.ePower * oppPokemon.weak[move.type] * stat;
//       if (move.stab) {
//         value = value * 1.5;
//       }
//       if (maxValue < value) maxValue = value;
//     }
//     total += maxValue;
//   }
//   return total;
// }

// function choose(n: number, r: number) {
//   let total = 1;
//   for (let i = n; i > n - r; i--) {
//     total = total * i;
//   }
//   for (let i = 1; i <= r; i++) {
//     total = total / i;
//   }
//   return total;
// }
