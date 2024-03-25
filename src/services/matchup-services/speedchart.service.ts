import { StatusName } from "@pkmn/data";
import { Field, Pokemon, Side } from "@smogon/calc";
import { getFinalSpeed } from "@smogon/calc/dist/mechanics/util";
import { Ruleset } from "../../data/rulesets";
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
  statuses: { status: StatusName | ""; modifier?: string }[];
  sides: { tailwind?: boolean; modifiers: string[] }[];
  fields: { modifiers: string[] }[];
  items: { item?: string }[];
  spreads: {
    evs?: { spe: number };
    ivs?: { spe: number };
    nature?: string;
    modifiers: string[];
  }[];
};
function getSpeedTiers(
  ruleset: Ruleset,
  p: PokemonData,
  level: number,
  teamIndex: string
) {
  return [
    ...generateTiers(ruleset, p, level, teamIndex, fastConfigurations),
    ...generateTiers(ruleset, p, level, teamIndex, slowConfigurations),
    ...generateTiers(ruleset, p, level, teamIndex, baseConfiugrations),
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
  statuses: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
  items: [{}, { item: "Choice Scarf" }],
  spreads: [
    { evs: { spe: 252 }, modifiers: ["252"] },
    { evs: { spe: 252 }, nature: "Timid", modifiers: ["252", "Positive"] },
  ],
  fields: [{ modifiers: [] }],
  sides: [{ modifiers: [] }, { tailwind: true, modifiers: ["Tailwind"] }],
};

const baseConfiugrations: Configurations = {
  boosts: [0],
  statuses: [{ status: "" }],
  items: [{}],
  spreads: [{ evs: { spe: 0 }, modifiers: [] }],
  fields: [{ modifiers: [] }],
  sides: [{ modifiers: [] }],
};

const slowConfigurations: Configurations = {
  boosts: [-1, 0],
  statuses: [{ status: "" }],
  items: [{ item: "Iron Ball" }],
  spreads: [
    { evs: { spe: 0 }, ivs: { spe: 0 }, modifiers: ["0"] },
    {
      evs: { spe: 0 },
      ivs: { spe: 0 },
      nature: "Brave",
      modifiers: ["0", "Negative"],
    },
  ],
  fields: [{ modifiers: [] }],
  sides: [{ modifiers: [] }],
};

function generateTiers(
  ruleset: Ruleset,
  p: PokemonData,
  level: number,
  teamIndex: string,
  configurations: Configurations
) {
  const tiers: Speedchart["tiers"] = [];
  for (const item of configurations.items) {
    for (const status of configurations.statuses) {
      for (const boost of configurations.boosts) {
        for (const sConfig of configurations.sides) {
          const side = new Side({ isTailwind: sConfig.tailwind });
          for (const fConfig of configurations.fields) {
            const field = new Field();
            for (const pConfig of configurations.spreads) {
              const pokemon = new Pokemon(ruleset.gen, p.pid, {
                level,
                evs: pConfig.evs,
                nature: pConfig.nature,
                item: item.item,
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
              if (item.item) {
                modifiers.push(item.item);
              }
              tiers.push({
                pokemon: p,
                speed: getFinalSpeed(ruleset.gen, pokemon, field, side),
                team: teamIndex,
                modifiers,
              });
            }
          }
        }
      }
    }
  }
  return tiers;
}

export function speedchart(
  ruleset: Ruleset,
  teams: PokemonData[][],
  level: number
): Speedchart {
  let tiers: Speedchart["tiers"] = [];

  for (const teamIndex in teams) {
    for (const pokemon of teams[teamIndex]) {
      tiers = tiers.concat(getSpeedTiers(ruleset, pokemon, level, teamIndex));
    }
  }

  tiers.sort((x, y) => y.speed - x.speed);

  const modifiers = getModifiers(tiers);
  return { modifiers, tiers, level };
}
