import { ID } from "@pkmn/data";
import { DraftSpecies } from "../../classes/pokemon";
import { PokemonData } from "../../models/pokemon.schema";

export type Coveragechart = (
  | PokemonData & {
      coverage: {
        [key: string]: CoverageMove[];
      };
    }
)[];

export type CoverageMove = {
  ePower: number;
  cPower: number;
  id: ID;
  name: string;
  type: string;
  recommended?: boolean;
  category: "Physical" | "Special";
  stab?: true;
};

export type FullCoverageMove = {
  id: string;
  name: string;
  type: string;
  category: string;
  accuracy: string;
  basePower: string;
  desc: string;
  pp: number;
  value: number;
};

export async function coveragechart(
  team: DraftSpecies[],
  oppTeam: DraftSpecies[]
): Promise<Coveragechart> {
  let result: Coveragechart = [];
  for (let pokemon of team) {
    let data: {
      species: DraftSpecies;
      coverage: {
        [key: string]: CoverageMove[];
      };
    } = {
      species: pokemon,
      coverage: await pokemon.bestCoverage(oppTeam),
    };
    for (let category in data.coverage) {
      data.coverage[category as keyof typeof data.coverage].sort(function (
        x: { stab?: true; ePower: number },
        y: { stab?: true; ePower: number }
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
    result.push({
      ...data.species.toPokemon(),
      coverage: data.coverage,
    });
  }
  return result;
}

export async function plannerCoverage(team: DraftSpecies[]) {
  let teamCoverage = await Promise.all(
    team.map(async (pokemon) => ({
      id: pokemon.id,
      coverage: await pokemon.coverage(),
      fullcoverage: await pokemon.fullcoverage(),
    }))
  );
  return {
    team: teamCoverage,
    max: {
      physical: teamCoverage.reduce((acc, pokemon) => {
        pokemon.coverage.physical.forEach((move) => {
          if (acc[move.type]) {
            if (acc[move.type].cPower < move.cPower) {
              acc[move.type] = move;
            }
          } else {
            acc[move.type] = move;
          }
        });
        return acc;
      }, {} as { [key: string]: CoverageMove }),
      special: teamCoverage.reduce((acc, pokemon) => {
        pokemon.coverage.special.forEach((move) => {
          if (acc[move.type]) {
            if (acc[move.type].cPower < move.cPower) {
              acc[move.type] = move;
            }
          } else {
            acc[move.type] = move;
          }
        });
        return acc;
      }, {} as { [key: string]: CoverageMove }),
    },
  };
}
