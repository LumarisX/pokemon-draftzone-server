import { AbilityName, ID, StatusName } from "@pkmn/data";
import { Field, Pokemon, Side } from "@smogon/calc";
import { getFinalSpeed } from "@smogon/calc/dist/mechanics/util";
import { DraftSpecies } from "../../classes/pokemon";

export type Speedchart = {
  modifiers: string[];
  tiers: {
    pokemon: {
      id: string;
    };
    team: string;
    speed: number;
    modifiers: string[];
  }[];
  level: number;
};

type Configurations = {
  stages: number[];
  additional: { modifier?: string; mult: number; noItem?: true }[];
  statuses: { status: StatusName | ""; modifier?: string }[];
  sides: { tailwind?: boolean; modifiers: string[] }[];
  fields: { modifiers: string[] }[];
  items: { addStages?: number[]; item?: string }[];
  spreads: {
    evs?: { spe: number };
    ivs?: { spe: number };
    nature?: string;
    modifiers: string[];
  }[];
};

function getSpeedTiers(
  pokemon: DraftSpecies,
  level: number,
  teamIndex: string
) {
  let fastConfigurations: Configurations = {
    stages: [0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
    items: [
      { addStages: [-1, 1, 2] },
      { addStages: [-1], item: "Choice Scarf" },
    ],
    spreads: [
      { evs: { spe: 252 }, modifiers: ["252"] },
      { evs: { spe: 252 }, nature: "Timid", modifiers: ["252", "Positive"] },
    ],
    fields: [{ modifiers: [] }],
    sides: [{ modifiers: [] }, { tailwind: true, modifiers: ["Tailwind"] }],
  };

  let baseConfiugrations: Configurations = {
    stages: [0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
    items: [{}],
    spreads: [{ evs: { spe: 0 }, modifiers: ["0"] }],
    fields: [{ modifiers: [] }],
    sides: [{ modifiers: [] }],
  };

  let slowConfigurations: Configurations = {
    stages: [-1, 0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }],
    items: [{}, { item: "Iron Ball" }],
    spreads: [
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
  for (let ability of Object.values(pokemon.abilities)) {
    ability = ability as AbilityName;
    switch (ability) {
      case "Unburden":
        fastConfigurations.additional.push({
          modifier: ability,
          mult: 2,
          noItem: true,
        });
        break;
      case "Chlorophyll":
      case "Sand Rush":
      case "Slush Rush":
      case "Swift Swim":
      case "Surge Surfer":
        fastConfigurations.additional.push({ modifier: ability, mult: 2 });
        break;
      case "Quick Feet":
        fastConfigurations.additional.push({
          modifier: ability,
          mult: 1.5,
          noItem: true,
        });
        break;
      case "Quark Drive":
      case "Protosynthesis":
        fastConfigurations.additional.push({ modifier: ability, mult: 1.5 });
        break;
      case "Speed Boost":
        fastConfigurations.stages.push(3, 4, 5, 6);
        break;
      case "Steam Engine":
        fastConfigurations.stages.push(6);
        break;
    }
  }
  return [
    ...generateTiers(pokemon, level, teamIndex, fastConfigurations),
    ...generateTiers(pokemon, level, teamIndex, baseConfiugrations),
    ...generateTiers(pokemon, level, teamIndex, slowConfigurations),
  ];
}

function tierModifiers(tiers: Speedchart["tiers"]): string[] {
  const uniqueModifiers: Set<string> = new Set(
    tiers.flatMap((tier) => tier.modifiers)
  );
  return Array.from(uniqueModifiers).sort();
}

function generateTiers(
  pokemon: DraftSpecies,
  level: number,
  teamIndex: string,
  configurations: Configurations
) {
  const tiers: Speedchart["tiers"] = [];
  for (const status of configurations.statuses) {
    if (status.status == "par" && pokemon.types.includes("Electric")) continue;
    for (const sConfig of configurations.sides) {
      const side = new Side({ isTailwind: sConfig.tailwind });
      for (const fConfig of configurations.fields) {
        const field = new Field();
        for (const pConfig of configurations.spreads) {
          for (const additional of configurations.additional) {
            for (const item of additional.noItem ||
            pokemon.requiredItem ||
            pokemon.requiredItems
              ? [{ addStages: [-1, 1, 2] }]
              : configurations.items) {
              for (const stage of [
                ...configurations.stages,
                ...(item.addStages || []),
              ]) {
                let id = pokemon.id;
                if (id === "aegislash") {
                  id = "aegislash-shield" as ID;
                }
                const pokemonCalc = new Pokemon(pokemon.ruleset.num, id, {
                  level,
                  evs: pConfig.evs,
                  ivs: pConfig.ivs,
                  nature: pConfig.nature,
                  item: item.item,
                  boosts: { spe: stage },
                  status: status.status,
                });
                const modifiers = [
                  ...(pConfig.modifiers || []),
                  ...(sConfig.modifiers || []),
                  ...(fConfig.modifiers || []),
                ];
                if (stage !== 0) {
                  modifiers.push("Stage " + stage);
                }
                if (status.modifier) {
                  modifiers.push(status.modifier);
                }
                if (item.item) {
                  modifiers.push(item.item);
                }
                if (additional.modifier) {
                  modifiers.push(additional.modifier);
                }
                tiers.push({
                  pokemon: { id: pokemon.id },
                  speed: Math.floor(
                    getFinalSpeed(pokemon.ruleset, pokemonCalc, field, side) *
                      additional.mult
                  ),
                  team: teamIndex,
                  modifiers,
                });
              }
            }
          }
        }
      }
    }
  }
  return tiers;
}

export function speedchart(teams: DraftSpecies[][], level: number): Speedchart {
  let tiers = teams
    .flatMap((team, teamIndex) =>
      team.flatMap((pokemon) =>
        getSpeedTiers(pokemon, level, teamIndex.toString())
      )
    )
    .sort((x, y) => y.speed - x.speed);
  const modifiers = tierModifiers(tiers);
  return { modifiers, tiers, level };
}
