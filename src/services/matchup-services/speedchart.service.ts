import { ID, StatusName } from "@pkmn/data";
import { Field, Pokemon, Side } from "@smogon/calc";
import { getFinalSpeed } from "@smogon/calc/dist/mechanics/util";
import { DraftSpecie, PokemonFormData } from "../../classes/pokemon";

export type Speedchart = {
  teams: (PokemonFormData & {
    spe: number;
    tiers: Tier[];
  })[][];
  level: number;
  modifiers: string[];
};

type Tier = {
  modifiers: string[];
  speed: number;
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

function getSpeedTiers(pokemon: DraftSpecie, level: number) {
  const fastConfigurations: Configurations = {
    stages: [0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
    items: [
      { addStages: [-1, 1, 2] },
      { addStages: [-1], item: "Choice Scarf" },
    ],
    spreads: [
      { evs: { spe: 252 }, modifiers: ["252"] },
      { evs: { spe: 252 }, nature: "Timid", modifiers: ["252+"] },
    ],
    fields: [{ modifiers: [] }],
    sides: [{ modifiers: [] }, { tailwind: true, modifiers: ["Tailwind"] }],
  };

  const baseConfiugrations: Configurations = {
    stages: [0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
    items: [{}],
    spreads: [{ evs: { spe: 0 }, modifiers: ["0"] }],
    fields: [{ modifiers: [] }],
    sides: [{ modifiers: [] }],
  };

  const slowConfigurations: Configurations = {
    stages: [-1, 0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }],
    items: [{}, { item: "Iron Ball" }],
    spreads: [
      {
        evs: { spe: 0 },
        ivs: { spe: 0 },
        nature: "Brave",
        modifiers: ["0- 0ivs"],
      },
    ],
    fields: [{ modifiers: [] }],
    sides: [{ modifiers: [] }],
  };
  pokemon.getAbilities().forEach((ability) => {
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
      case "Bull Rush":
        fastConfigurations.additional.push({
          modifier: ability,
          mult: 1.5,
        });
        break;
    }
  });
  return [
    ...generateTiers(pokemon, level, fastConfigurations),
    ...generateTiers(pokemon, level, baseConfiugrations),
    ...generateTiers(pokemon, level, slowConfigurations),
  ];
}

function tierModifiers(teams: Speedchart["teams"]): string[] {
  const uniqueModifiers: Set<string> = new Set(
    teams.flatMap((team) =>
      team.flatMap((pokemon) => pokemon.tiers.flatMap((tier) => tier.modifiers))
    )
  );
  return Array.from(uniqueModifiers);
}

function generateTiers(
  pokemon: DraftSpecie,
  level: number,
  configurations: Configurations
) {
  const tiers: Tier[] = [];
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
                try {
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
                    if (stage >= 0) {
                      modifiers.push("+" + stage);
                    } else {
                      modifiers.push("" + stage);
                    }
                  }
                  if (status.modifier) modifiers.push(status.modifier);
                  if (item.item) modifiers.push(item.item);
                  if (additional.modifier) modifiers.push(additional.modifier);
                  tiers.push({
                    speed: Math.floor(
                      //TODO: fix ts-expect-error by updating @smogon/calc
                      // @ts-expect-error @smogon/calc uses older Generation version than mutual dependency
                      getFinalSpeed(pokemon.ruleset, pokemonCalc, field, side) *
                        additional.mult
                    ),
                    modifiers,
                  });
                } catch {}
              }
            }
          }
        }
      }
    }
  }
  return tiers;
}

export function speedchart(
  teamsRaw: DraftSpecie[][],
  level: number
): Speedchart {
  const teams = teamsRaw.map((team) =>
    team.map((pokemon) => ({
      ...pokemon.toClient(),
      spe: pokemon.baseStats.spe,
      tiers: getSpeedTiers(pokemon, level),
    }))
  );
  const modifiers = tierModifiers(teams);
  return {
    teams,
    level,
    modifiers,
  };
}
