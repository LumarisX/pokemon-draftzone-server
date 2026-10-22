export const RARITIES = ["bronze", "silver", "gold", "platinum"] as const;
export type Rarity = (typeof RARITIES)[number];

export type GamePokemon = { id: string; kills: number; fainted: boolean };

export type TeamGame = {
  won: boolean;
  lost: boolean;
  pokemon: GamePokemon[];
};

export type TeamMatch = {
  matchupId: string;
  at: Date | null;
  outcome: "w" | "d" | "l";
  forfeit: boolean;
  games: TeamGame[];
};

export type TeamSeason = {
  teamId: string;
  matches: TeamMatch[];
  trades: { at: Date | null }[];
  champion: { at: Date | null } | null;
};

export type AchievementEvent = { at: Date | null };

export type AchievementTier = { rarity: Rarity; count: number };

export interface AchievementDefinition {
  id: string;
  name: string;
  hint: (count: number) => string;
  icon: string;
  hidden?: boolean;
  tiers: readonly AchievementTier[];
  events(season: TeamSeason): AchievementEvent[];
}

export type EarnedAchievement = {
  id: string;
  rarity: Rarity;
  tier: number;
  count: number;
  next: number | null;
  earnedAt: Date | null;
};

export type AchievementProgress = Omit<EarnedAchievement, "rarity"> & {
  rarity: Rarity | null;
};

export function achievementProgress(
  definition: AchievementDefinition,
  season: TeamSeason,
): AchievementProgress {
  const events = definition.events(season);
  const reached = definition.tiers.filter((tier) => events.length >= tier.count);
  const tier = reached.length - 1;
  const top = reached[tier];
  return {
    id: definition.id,
    rarity: top?.rarity ?? null,
    tier,
    count: events.length,
    next: definition.tiers[tier + 1]?.count ?? null,
    earnedAt: top ? (events[top.count - 1]?.at ?? null) : null,
  };
}

export function evaluateAchievement(
  definition: AchievementDefinition,
  season: TeamSeason,
): EarnedAchievement | null {
  const progress = achievementProgress(definition, season);
  return progress.rarity ? { ...progress, rarity: progress.rarity } : null;
}

export function evaluateAchievements(
  catalog: readonly AchievementDefinition[],
  season: TeamSeason,
): EarnedAchievement[] {
  return catalog.flatMap((definition) => {
    const earned = evaluateAchievement(definition, season);
    return earned ? [earned] : [];
  });
}

export function runningBest<T>(
  items: readonly T[],
  score: (item: T, state: Map<string, number>) => void,
  at: (item: T) => Date | null,
): AchievementEvent[] {
  const state = new Map<string, number>();
  const events: AchievementEvent[] = [];
  let best = 0;
  for (const item of items) {
    score(item, state);
    const top = Math.max(0, ...state.values());
    while (best < top) {
      best += 1;
      events.push({ at: at(item) });
    }
  }
  return events;
}
