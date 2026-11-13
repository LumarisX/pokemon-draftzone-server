import { achievementCatalog } from "@modules/achievement/domain/catalog";

export type ProfileRecord = { wins: number; draws: number; losses: number };

export type ProfileOutcome = {
  placement: number;
  of: number;
  label: string | null;
  champion: boolean;
};

export type ProfileSeason = {
  id: string;
  kind: "hosted" | "external" | "archive";
  teamName: string;
  logo: string | null;
  leagueName: string;
  tournamentName: string | null;
  pokemon: unknown[];
  record: ProfileRecord | null;
  outcome: ProfileOutcome | null;
  completedAt: string | null;
  hosted: {
    leagueSlug: string;
    tournamentSlug: string;
    teamSlug: string;
  } | null;
  external: { slug: string } | null;
  archive: { id: string } | null;
};

export type EarnedAchievement = { id: string; rarity: string };

const RARITY_ORDER = ["bronze", "silver", "gold", "platinum"];

function time(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

export function orderSeasons(seasons: ProfileSeason[]): ProfileSeason[] {
  return [...seasons].sort(
    (a, b) => time(b.completedAt) - time(a.completedAt),
  );
}

export function careerFrom(
  records: (ProfileRecord | null)[],
  outcomes: (ProfileOutcome | null)[],
) {
  const totals = records.reduce<ProfileRecord>(
    (sum, record) => ({
      wins: sum.wins + (record?.wins ?? 0),
      draws: sum.draws + (record?.draws ?? 0),
      losses: sum.losses + (record?.losses ?? 0),
    }),
    { wins: 0, draws: 0, losses: 0 },
  );
  const decided = totals.wins + totals.losses;
  const placed = outcomes
    .filter((outcome): outcome is ProfileOutcome => !!outcome)
    .sort((a, b) => a.placement - b.placement || b.of - a.of);
  return {
    seasons: records.length,
    ...totals,
    winRate: decided ? Math.round((totals.wins / decided) * 100) : null,
    titles: placed.filter((outcome) => outcome.champion).length,
    best: placed[0] ? { placement: placed[0].placement, of: placed[0].of } : null,
  };
}

export function achievementsFrom(earned: EarnedAchievement[]) {
  return achievementCatalog()
    .flatMap((definition) => {
      const mine = earned.filter((entry) => entry.id === definition.id);
      if (mine.length === 0) return [];
      const best = Math.max(
        ...mine.map((entry) => RARITY_ORDER.indexOf(entry.rarity)),
      );
      return [
        {
          id: definition.id,
          name: definition.name,
          icon: definition.icon,
          rarity: RARITY_ORDER[Math.max(best, 0)],
          rank: best,
          seasons: mine.length,
        },
      ];
    })
    .sort((a, b) => b.rank - a.rank || b.seasons - a.seasons)
    .map(({ rank: _rank, ...achievement }) => achievement);
}
