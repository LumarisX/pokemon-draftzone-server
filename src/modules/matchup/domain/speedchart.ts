import { ID, StatusName } from "@pkmn/data";
import { computeStats } from "../../../../dmg/stats";
import { State } from "../../../../dmg/state";
import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { PDZPokemonSet } from "@modules/pokemon-set/pokemon-set.domain";

export type Speedchart = {
  teams: (Omit<PokemonDto, "draftFormes"> & {
    spe: number;
    tiers: Tier[];
    draftFormes?: SpeedchartForme[];
  })[][];
  level: number;
  modifiers: string[];
};

export type SpeedchartForme = {
  id: string;
  name: string;
  spe?: number;
  tiers?: Tier[];
};

type Tier = {
  modifiers: string[];
  speed: number;
};

type SpeedScenario = {
  evs?: { spe: number };
  ivs?: { spe: number };
  sps?: { spe: number };
  nature?: string;
  item?: string;
  stage: number;
  status: StatusName | "";
  isTailwind: boolean;
  additionalMult: number;
  modifiers: string[];
};

type SpeedTierPreset = {
  stages: number[];
  additional: { modifier?: string; mult: number; noItem?: true }[];
  statuses: { status: StatusName | ""; modifier?: string }[];
  sides: { tailwind?: boolean; modifiers: string[] }[];
  items: { addStages?: number[]; item?: string }[];
  spreads: {
    evs?: { spe: number };
    ivs?: { spe: number };
    sps?: { spe: number };
    nature?: string;
    modifiers: string[];
  }[];
};

const LEGACY_BOOSTS = [
  25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400,
];

const MAX_EVS = 252;
const MAX_SPS = 32;
const MIN_SPS = 0;

function maxInvestmentLabel(useStatPoints: boolean): string {
  return String(useStatPoints ? MAX_SPS : MAX_EVS);
}

type AbilitySpeedRule =
  | { kind: "multiplier"; mult: number; noItem?: true }
  | { kind: "stages"; stages: number[] };

const ABILITY_SPEED_RULES: Partial<Record<string, AbilitySpeedRule>> = {
  Unburden: { kind: "multiplier", mult: 2, noItem: true },
  Chlorophyll: { kind: "multiplier", mult: 2 },
  "Sand Rush": { kind: "multiplier", mult: 2 },
  "Slush Rush": { kind: "multiplier", mult: 2 },
  "Swift Swim": { kind: "multiplier", mult: 2 },
  "Surge Surfer": { kind: "multiplier", mult: 2 },
  "Quick Feet": { kind: "multiplier", mult: 1.5, noItem: true },
  "Quark Drive": { kind: "multiplier", mult: 1.5 },
  Protosynthesis: { kind: "multiplier", mult: 1.5 },
  "Speed Boost": { kind: "stages", stages: [3, 4, 5, 6] },
  "Steam Engine": { kind: "stages", stages: [6] },
  "Bull Rush": { kind: "multiplier", mult: 1.5 },
};

function abilitySpeedModifiers(abilities: string[]): {
  additional: { modifier: string; mult: number; noItem?: true }[];
  stages: number[];
} {
  const additional: { modifier: string; mult: number; noItem?: true }[] = [];
  const stages: number[] = [];

  for (const ability of abilities) {
    const rule = ABILITY_SPEED_RULES[ability];
    if (!rule) continue;

    if (rule.kind === "multiplier") {
      additional.push({
        modifier: ability,
        mult: rule.mult,
        noItem: rule.noItem,
      });
    } else {
      stages.push(...rule.stages);
    }
  }

  return { additional, stages };
}

function pokeRound(value: number): number {
  return value % 1 > 0.5 ? Math.ceil(value) : Math.floor(value);
}

function applySpeedModifier(speed: number, mod: number): number {
  return pokeRound(((speed * mod) >>> 0) / 0x1000);
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

function getSpeedTierPresets(pokemon: PDZPokemon): SpeedTierPreset[] {
  const useStatPoints = pokemon.ruleset.useStatPoints;
  const maxLabel = maxInvestmentLabel(useStatPoints);
  const abilityModifiers = abilitySpeedModifiers(pokemon.getAbilities());

  const fast: SpeedTierPreset = {
    stages: [0, ...abilityModifiers.stages],
    additional: [{ mult: 1 }, ...abilityModifiers.additional],
    statuses: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
    items: [
      { addStages: [-1, 1, 2] },
      { addStages: [-1], item: "Choice Scarf" },
    ],
    spreads: [
      { evs: { spe: MAX_EVS }, sps: { spe: MAX_SPS }, modifiers: [maxLabel] },
      {
        evs: { spe: MAX_EVS },
        sps: { spe: MAX_SPS },
        nature: "Timid",
        modifiers: [`${maxLabel}+`],
      },
    ],
    sides: [{ modifiers: [] }, { tailwind: true, modifiers: ["Tailwind"] }],
  };

  const base: SpeedTierPreset = {
    stages: [0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }, { status: "par", modifier: "Paralysis" }],
    items: [{}],
    spreads: [{ evs: { spe: 0 }, sps: { spe: MIN_SPS }, modifiers: ["0"] }],
    sides: [{ modifiers: [] }],
  };

  const slow: SpeedTierPreset = {
    stages: [-1, 0],
    additional: [{ mult: 1 }],
    statuses: [{ status: "" }],
    items: [{}, { item: "Iron Ball" }],
    spreads: [
      useStatPoints
        ? { sps: { spe: MIN_SPS }, nature: "Brave", modifiers: ["0-"] }
        : {
            evs: { spe: 0 },
            ivs: { spe: 0 },
            nature: "Brave",
            modifiers: ["0- 0ivs"],
          },
    ],
    sides: [{ modifiers: [] }],
  };

  return [fast, base, slow];
}

function tierModifiers(teams: Speedchart["teams"]): string[] {
  const uniqueModifiers: Set<string> = new Set(
    teams.flatMap((team) =>
      team.flatMap((pokemon) =>
        [
          ...pokemon.tiers,
          ...(pokemon.draftFormes?.flatMap((forme) => forme.tiers ?? []) ?? []),
        ].flatMap((tier) => tier.modifiers),
      ),
    ),
  );
  return Array.from(uniqueModifiers);
}

function buildScenarios(
  pokemon: PDZPokemon,
  preset: SpeedTierPreset,
): SpeedScenario[] {
  const isItemLocked = Boolean(pokemon.requiredItem || pokemon.requiredItems);

  const statuses = preset.statuses.filter(
    (status) =>
      !(status.status === "par" && pokemon.types.includes("Electric")),
  );

  return statuses.flatMap((status) =>
    preset.sides.flatMap((side) =>
      preset.spreads.flatMap((spread) =>
        preset.additional.flatMap((additional) => {
          const items =
            additional.noItem || isItemLocked
              ? [{ addStages: [-1, 1, 2] }]
              : preset.items;

          return items.flatMap((item) => {
            const stages = [...preset.stages, ...(item.addStages ?? [])];

            return stages.map((stage): SpeedScenario => {
              const modifiers = [...spread.modifiers, ...side.modifiers];

              if (stage !== 0)
                modifiers.push(stage >= 0 ? `+${stage}` : `${stage}`);
              if (status.modifier) modifiers.push(status.modifier);
              if (item.item) modifiers.push(item.item);
              if (additional.modifier) modifiers.push(additional.modifier);

              return {
                evs: spread.evs,
                ivs: spread.ivs,
                sps: spread.sps,
                nature: spread.nature,
                item: item.item,
                stage,
                status: status.status,
                isTailwind: side.tailwind ?? false,
                additionalMult: additional.mult,
                modifiers,
              };
            });
          });
        }),
      ),
    ),
  );
}

function evaluateScenario(
  pokemon: PDZPokemon,
  level: number,
  scenario: SpeedScenario,
): Tier | null {
  const id =
    pokemon.id === "aegislash" ? ("aegislash-shield" as ID) : pokemon.id;

  try {
    const dmgGeneration = pokemon.ruleset;

    const set = new PDZPokemonSet(
      {
        id,
        level,
        evs: scenario.evs,
        ivs: scenario.ivs,
        sps: scenario.sps,
      },
      dmgGeneration,
    );

    const pokemonState = State.createPokemon(dmgGeneration, id, {
      level: set.level,
      evs: set.evs,
      ivs: set.ivs,
      // Nature and item are intentionally NOT resolved through PDZPokemonSet: that resolution is
      // lenient (unknown name -> undefined), but dmg/state.ts deliberately throws when a nature or
      // item doesn't exist yet in this generation/ruleset, which speedchart relies on to drop
      // impossible scenarios (e.g. a nature or Choice Scarf in Generation 1).
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
  pokemon: PDZPokemon,
  level: number,
  preset: SpeedTierPreset,
): Tier[] {
  const tiers = buildScenarios(pokemon, preset)
    .map((scenario) => evaluateScenario(pokemon, level, scenario))
    .filter((tier): tier is Tier => tier !== null);

  const seenTiers = new Set<string>();
  return tiers.filter((tier) => {
    const sortedModifierKey = [...tier.modifiers].sort().join(",");
    const uniquenessKey = `${tier.speed}::${sortedModifierKey}`;

    if (seenTiers.has(uniquenessKey)) return false;
    seenTiers.add(uniquenessKey);
    return true;
  });
}

function getSpeedTiers(pokemon: PDZPokemon, level: number): Tier[] {
  return getSpeedTierPresets(pokemon).flatMap((preset) =>
    generateTiers(pokemon, level, preset),
  );
}

function getFormeSpeedTiers(
  id: ID,
  ruleset: PDZPokemon["ruleset"],
  level: number,
): SpeedchartForme {
  const forme = PDZPokemon.tryCreate(id, ruleset);
  if (!forme) return { id, name: id };
  return {
    id,
    name: forme.name,
    spe: forme.baseStats.spe,
    tiers: getSpeedTiers(forme, level),
  };
}

export function speedchart(
  teamsRaw: PDZPokemon[][],
  level: number,
): Speedchart {
  const teams = teamsRaw.map((team) =>
    team.map((pokemon) => ({
      ...PokemonMapper.toClientPayload(pokemon),
      spe: pokemon.baseStats.spe,
      tiers: getSpeedTiers(pokemon, level),
      draftFormes: pokemon.draftFormes?.map((formeId) =>
        getFormeSpeedTiers(formeId, pokemon.ruleset, level),
      ),
    })),
  );
  const modifiers = tierModifiers(teams);
  return {
    teams,
    level,
    modifiers,
  };
}
