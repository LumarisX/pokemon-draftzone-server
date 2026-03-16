import { ID, StatusName } from "@pkmn/data";
import { computeStats, State } from "../../../vendor/dmg/build";
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

type SpeedScenario = {
  evs?: { spe: number };
  ivs?: { spe: number };
  nature?: string;
  item?: string;
  stage: number;
  status: StatusName | "";
  isTailwind: boolean;
  additionalMult: number;
  modifiers: string[];
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

const LEGACY_BOOSTS = [
  25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400,
];

function roundDown(value: number): number {
  return value % 1 > 0.5 ? Math.ceil(value) : Math.floor(value);
}

function applySpeedModifier(speed: number, mod: number): number {
  // Keep Showdown-style fixed point modifier behavior for speed changes.
  return roundDown(((speed * mod) >>> 0) / 0x1000);
}

function applySpeedBoost(speed: number, stage: number, genNum: number): number {
  if (genNum <= 2) {
    const adjusted = Math.floor((speed * LEGACY_BOOSTS[stage + 6]) / 100);
    return Math.max(1, Math.min(adjusted, 999));
  }

  if (stage >= 0) {
    return Math.floor((speed * (2 + stage)) / 2);
  }

  return Math.floor((speed * 2) / (Math.abs(stage) + 2));
}

function applyScenarioSpeedEffects(
  baseSpeed: number,
  scenario: SpeedScenario,
  genNum: number,
): number {
  let speed = applySpeedBoost(baseSpeed, scenario.stage, genNum);

  if (scenario.item === "Choice Scarf") {
    speed = applySpeedModifier(speed, 0x1800);
  } else if (scenario.item === "Iron Ball") {
    speed = applySpeedModifier(speed, 0x0800);
  }

  if (scenario.isTailwind) {
    speed = applySpeedModifier(speed, 0x2000);
  }

  if (scenario.status === "par") {
    speed = applySpeedModifier(speed, genNum > 6 ? 0x0800 : 0x0400);
  }

  return genNum <= 2
    ? Math.min(Math.max(speed, 1), 999)
    : Math.min(speed, 10000);
}

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

  const baseConfigurations: Configurations = {
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
    ...generateTiers(pokemon, level, baseConfigurations),
    ...generateTiers(pokemon, level, slowConfigurations),
  ];
}

function tierModifiers(teams: Speedchart["teams"]): string[] {
  const uniqueModifiers: Set<string> = new Set(
    teams.flatMap((team) =>
      team.flatMap((pokemon) =>
        pokemon.tiers.flatMap((tier) => tier.modifiers),
      ),
    ),
  );
  return Array.from(uniqueModifiers);
}

function buildScenarios(
  pokemon: DraftSpecie,
  configurations: Configurations,
): SpeedScenario[] {
  const scenarios: SpeedScenario[] = [];

  for (const status of configurations.statuses) {
    if (status.status === "par" && pokemon.types.includes("Electric")) continue;

    for (const sConfig of configurations.sides) {
      for (const fConfig of configurations.fields) {
        for (const pConfig of configurations.spreads) {
          for (const additional of configurations.additional) {
            // Species with a required item are always held-item locked — treat
            // them as no-item choices so the item slot isn't double-applied.
            const itemList =
              additional.noItem || pokemon.requiredItem || pokemon.requiredItems
                ? [{ addStages: [-1, 1, 2] }]
                : configurations.items;

            for (const item of itemList) {
              const stages = [
                ...configurations.stages,
                ...(item.addStages ?? []),
              ];

              for (const stage of stages) {
                const modifiers = [
                  ...(pConfig.modifiers ?? []),
                  ...(sConfig.modifiers ?? []),
                  ...(fConfig.modifiers ?? []),
                ];

                if (stage !== 0)
                  modifiers.push(stage >= 0 ? `+${stage}` : `${stage}`);
                if (status.modifier) modifiers.push(status.modifier);
                if (item.item) modifiers.push(item.item);
                if (additional.modifier) modifiers.push(additional.modifier);

                scenarios.push({
                  evs: pConfig.evs,
                  ivs: pConfig.ivs,
                  nature: pConfig.nature,
                  item: item.item,
                  stage,
                  status: status.status,
                  isTailwind: sConfig.tailwind ?? false,
                  additionalMult: additional.mult,
                  modifiers,
                });
              }
            }
          }
        }
      }
    }
  }

  return scenarios;
}

function evaluateScenario(
  pokemon: DraftSpecie,
  level: number,
  scenario: SpeedScenario,
): Tier | null {
  // aegislash speed is derived from the shield forme
  const id =
    pokemon.id === "aegislash" ? ("aegislash-shield" as ID) : pokemon.id;

  try {
    const dmgGeneration = pokemon.ruleset;

    const pokemonState = State.createPokemon(dmgGeneration, id, {
      level,
      evs: scenario.evs,
      ivs: scenario.ivs,
      nature: scenario.nature,
      item: scenario.item,
      status: scenario.status || undefined,
    });

    const stats = computeStats(dmgGeneration, {
      ...pokemonState,
      boosts: {},
    });
    const speed = applyScenarioSpeedEffects(
      stats.spe,
      scenario,
      pokemon.ruleset.num,
    );

    return {
      speed: Math.floor(speed * scenario.additionalMult),
      modifiers: scenario.modifiers,
    };
  } catch {
    return null;
  }
}

function generateTiers(
  pokemon: DraftSpecie,
  level: number,
  configurations: Configurations,
): Tier[] {
  return buildScenarios(pokemon, configurations)
    .map((scenario) => evaluateScenario(pokemon, level, scenario))
    .filter((tier): tier is Tier => tier !== null);
}

export function speedchart(
  teamsRaw: DraftSpecie[][],
  level: number,
): Speedchart {
  const teams = teamsRaw.map((team) =>
    team.map((pokemon) => ({
      ...pokemon.toClient(),
      spe: pokemon.baseStats.spe,
      tiers: getSpeedTiers(pokemon, level),
    })),
  );
  const modifiers = tierModifiers(teams);
  return {
    teams,
    level,
    modifiers,
  };
}
