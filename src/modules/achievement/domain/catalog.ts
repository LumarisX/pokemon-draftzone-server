import {
  AchievementDefinition,
  AchievementEvent,
  TeamGame,
  TeamSeason,
  runningBest,
} from "./achievement";

type DatedGame = { game: TeamGame; at: Date | null };

function games(season: TeamSeason): DatedGame[] {
  return season.matches.flatMap((match) =>
    match.games.map((game) => ({ game, at: match.at })),
  );
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

const dated = (at: Date | null): AchievementEvent => ({ at });

export function achievementCatalog() {
  return ACHIEVEMENTS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    icon: definition.icon,
    hidden: definition.hidden ?? false,
    tiers: definition.tiers.map((tier) => ({
      rarity: tier.rarity,
      count: tier.count,
      hint: definition.hint(tier.count),
    })),
  }));
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: "victor",
    name: "Victor",
    icon: "military_tech",
    hint: (count) => `Win ${plural(count, "match", "matches")} in a season.`,
    tiers: [
      { rarity: "bronze", count: 1 },
      { rarity: "silver", count: 3 },
      { rarity: "gold", count: 5 },
      { rarity: "platinum", count: 7 },
    ],
    events: (season) =>
      season.matches
        .filter((match) => match.outcome === "w" && !match.forfeit)
        .map((match) => dated(match.at)),
  },
  {
    id: "on-a-roll",
    name: "On a Roll",
    icon: "local_fire_department",
    hint: (count) => `Win ${count} matches in a row.`,
    tiers: [
      { rarity: "bronze", count: 2 },
      { rarity: "silver", count: 3 },
      { rarity: "gold", count: 5 },
    ],
    events: (season) =>
      runningBest(
        season.matches.filter((match) => !match.forfeit),
        (match, state) =>
          state.set(
            "streak",
            match.outcome === "w" ? (state.get("streak") ?? 0) + 1 : 0,
          ),
        (match) => match.at,
      ),
  },
  {
    id: "clean-sweep",
    name: "Clean Sweep",
    icon: "cleaning_services",
    hint: () => "Win a match without dropping a single game.",
    tiers: [{ rarity: "silver", count: 1 }],
    events: (season) =>
      season.matches
        .filter(
          (match) =>
            match.outcome === "w" &&
            !match.forfeit &&
            match.games.length >= 2 &&
            match.games.every((game) => !game.lost),
        )
        .map((match) => dated(match.at)),
  },
  {
    id: "flawless",
    name: "Flawless",
    icon: "shield",
    hint: () => "Win a game without losing a single Pokémon.",
    tiers: [{ rarity: "gold", count: 1 }],
    events: (season) =>
      games(season)
        .filter(
          ({ game }) =>
            game.won &&
            game.pokemon.length > 0 &&
            game.pokemon.every((pokemon) => !pokemon.fainted),
        )
        .map(({ at }) => dated(at)),
  },
  {
    id: "one-mon-army",
    name: "One-Mon Army",
    icon: "bolt",
    hint: () => "Have one Pokémon score 3 KOs in a single game.",
    tiers: [{ rarity: "gold", count: 1 }],
    events: (season) =>
      games(season)
        .filter(({ game }) => game.pokemon.some((pokemon) => pokemon.kills >= 3))
        .map(({ at }) => dated(at)),
  },
  {
    id: "heavy-hitter",
    name: "Heavy Hitter",
    icon: "sports_mma",
    hint: (count) => `Score ${count} KOs with one Pokémon in a season.`,
    tiers: [
      { rarity: "bronze", count: 5 },
      { rarity: "silver", count: 10 },
      { rarity: "gold", count: 20 },
    ],
    events: (season) =>
      runningBest(
        games(season),
        ({ game }, state) => {
          for (const pokemon of game.pokemon)
            state.set(pokemon.id, (state.get(pokemon.id) ?? 0) + pokemon.kills);
        },
        ({ at }) => at,
      ),
  },
  {
    id: "iron-wall",
    name: "Iron Wall",
    icon: "security",
    hint: (count) =>
      `Bring the same Pokémon ${count} games in a row without it fainting.`,
    tiers: [
      { rarity: "silver", count: 3 },
      { rarity: "gold", count: 5 },
    ],
    events: (season) =>
      runningBest(
        games(season),
        ({ game }, state) => {
          for (const pokemon of game.pokemon)
            state.set(
              pokemon.id,
              pokemon.fainted ? 0 : (state.get(pokemon.id) ?? 0) + 1,
            );
        },
        ({ at }) => at,
      ),
  },
  {
    id: "wheeler-dealer",
    name: "Wheeler-Dealer",
    icon: "swap_horiz",
    hint: () => "Complete a trade.",
    tiers: [{ rarity: "bronze", count: 1 }],
    events: (season) => season.trades.map((trade) => dated(trade.at)),
  },
  {
    id: "champion",
    name: "Champion",
    icon: "trophy",
    hidden: true,
    hint: () => "Win the season.",
    tiers: [{ rarity: "platinum", count: 1 }],
    events: (season) => (season.champion ? [dated(season.champion.at)] : []),
  },
];
