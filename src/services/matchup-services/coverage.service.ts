import { ID } from "@pkmn/data";
import { DraftSpecies, PokemonFormData } from "../../classes/pokemon";

export type Coveragechart = (
  | PokemonFormData & {
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
      ...data.species.toClient(),
      coverage: data.coverage,
    });
  }
  return result;
}

export async function plannerCoverage(team: DraftSpecies[]) {
  const teamCoverage = await Promise.all(
    team.map(async (pokemon) => ({
      id: pokemon.id,
      coverage: await pokemon.coverage(),
      fullcoverage: await pokemon.fullcoverage(),
    }))
  );

  const physicalCoverage: Record<string, number> = {};
  const specialCoverage: Record<string, number> = {};

  teamCoverage.forEach((team) => {
    for (const type in team.fullcoverage.physical) {
      physicalCoverage[type] = (physicalCoverage[type] || 0) + 1;
    }

    for (const type in team.fullcoverage.special) {
      specialCoverage[type] = (specialCoverage[type] || 0) + 1;
    }
  });

  const physicalArray = Object.entries(physicalCoverage).map(
    ([type, value]) => ({
      type,
      category: "physical",
      value,
    })
  );

  const specialArray = Object.entries(specialCoverage).map(([type, value]) => ({
    type,
    category: "special",
    value,
  }));

  return {
    team: teamCoverage,
    max: [...physicalArray, ...specialArray],
  };
}
