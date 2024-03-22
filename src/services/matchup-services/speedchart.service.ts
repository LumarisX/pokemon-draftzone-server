import { Generation, StatusName } from "@pkmn/data";
import { Field, Pokemon, Side } from "@smogon/calc";
import { getFinalSpeed } from "@smogon/calc/dist/mechanics/util";
import { PokemonData } from "../../models/pokemon.schema";

export type Speedchart = {
  modifiers: string[];
  tiers: {
    pokemon: {
      pid: string;
    };
    team: string;
    speed: number;
    modifiers: string[];
  }[];
  level: number;
};

type Configurations = {
  boosts: number[];
  status: { status: StatusName | ""; modifier?: string }[];
  sides: { tailwind?: boolean; modifiers: string[] }[];
  fields: { modifiers: string[] }[];
  pokemons: {
    evs?: { spe: number };
    ivs?: { spe: number };
    nature?: string;
    item?: string;
    modifiers: string[];
  }[];
};
function getSpeedTiers(
  gen: Generation,
  p: PokemonData,
  level: number,
  teamIndex: string
) {
  return [
    ...generateTiers(gen, p, level, teamIndex, fastConfigurations),
    ...generateTiers(gen, p, level, teamIndex, slowConfigurations),
  ];
}

function getModifiers(tiers: Speedchart["tiers"]): string[] {
  const uniqueModifiers: Set<string> = new Set();
  for (const tier of tiers) {
    for (const modifier of tier.modifiers) {
      uniqueModifiers.add(modifier);
    }
  }
  return Array.from(uniqueModifiers);
}

const fastConfigurations: Configurations = {
  boosts: [-1, 0, 1, 2],
  status: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
  pokemons: [
    { evs: { spe: 252 }, modifiers: ["Max"] },
    { evs: { spe: 252 }, nature: "Timid", modifiers: ["Max", "Positive"] },
    { evs: { spe: 252 }, item: "Choice Scarf", modifiers: ["Max", "Scarf"] },
    {
      evs: { spe: 252 },
      nature: "Timid",
      item: "Choice Scarf",
      modifiers: ["Max", "Positive", "Scarf"],
    },
  ],
  fields: [{ modifiers: [] }],
  sides: [{ modifiers: [] }, { tailwind: true, modifiers: ["Tailwind"] }],
};

const slowConfigurations: Configurations = {
  boosts: [-1, 0],
  status: [{ status: "" }],
  pokemons: [
    { evs: { spe: 0 }, modifiers: [] },
    { evs: { spe: 0 }, ivs: { spe: 0 }, modifiers: ["Min"] },
    {
      evs: { spe: 0 },
      ivs: { spe: 0 },
      nature: "Brave",
      modifiers: ["Min", "Negative"],
    },
    {
      evs: { spe: 0 },
      ivs: { spe: 0 },
      item: "Iron Ball",
      modifiers: ["Min", "Iron Ball"],
    },
    {
      evs: { spe: 0 },
      ivs: { spe: 0 },
      nature: "Brave",
      item: "Iron Ball",
      modifiers: ["Min", "Negative", "Iron Ball"],
    },
    {
      evs: { spe: 252 },
      nature: "Timid",
      item: "Choice Scarf",
      modifiers: ["Max", "Positive", "Scarf"],
    },
  ],
  fields: [{ modifiers: [] }],
  sides: [{ modifiers: [] }, { tailwind: true, modifiers: ["Tailwind"] }],
};

function generateTiers(
  gen: Generation,
  p: PokemonData,
  level: number,
  teamIndex: string,
  configurations: Configurations
) {
  const tiers: Speedchart["tiers"] = [];
  for (const status of configurations.status) {
    for (const boost of configurations.boosts) {
      for (const sConfig of configurations.sides) {
        const side = new Side({ isTailwind: sConfig.tailwind });
        for (const fConfig of configurations.fields) {
          const field = new Field();
          for (const pConfig of configurations.pokemons) {
            const pokemon = new Pokemon(gen, p.pid, {
              level,
              evs: pConfig.evs,
              nature: pConfig.nature,
              item: pConfig.item,
              boosts: { spe: boost },
              status: status.status,
            });
            const modifiers = [
              ...(pConfig.modifiers || []),
              ...(sConfig.modifiers || []),
              ...(fConfig.modifiers || []),
            ];
            if (boost !== 0) {
              modifiers.push("Stage " + boost);
            }
            if (status.modifier) {
              modifiers.push(status.modifier);
            }
            tiers.push({
              pokemon: p,
              speed: getFinalSpeed(gen, pokemon, field, side),
              team: teamIndex,
              modifiers,
            });
          }
        }
      }
    }
  }
  return tiers;
}

export function speedchart(
  gen: Generation,
  teams: PokemonData[][],
  level: number
): Speedchart {
  let tiers: Speedchart["tiers"] = [];

  for (const teamIndex in teams) {
    for (const pokemon of teams[teamIndex]) {
      tiers = tiers.concat(getSpeedTiers(gen, pokemon, level, teamIndex));
    }
  }

  tiers.sort((x, y) => y.speed - x.speed);

  const modifiers = getModifiers(tiers);
  return { modifiers, tiers, level };
}
