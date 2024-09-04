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
  id: ID;
  name: string;
  type: string;
  recommended?: boolean;
  category: "Physical" | "Special";
  stab?: true;
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
