export type StoredPlanPokemon = {
  id: string;
  tier: string;
  value: number | null;
  locked?: boolean;
};

export type StoredPlan = {
  format: string;
  ruleset: string;
  draftName: string;
  min: number;
  max: number;
  system: string;
  totalPoints: number;
  team: StoredPlanPokemon[];
  baseline?: string[];
};

export const MAX_PLANS = 9;
export const MAX_PLAN_KEYS = 200;
const MAX_TEAM = 40;
const MAX_TEXT = 120;
const FREE_KEY = "plannerData";
const KEY_PATTERN = /^plannerData(:[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64})?$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isPlanKey(key: unknown): key is string {
  return typeof key === "string" && KEY_PATTERN.test(key);
}

export function tournamentOfKey(
  key: string,
): { leagueSlug: string; tournamentSlug: string } | null {
  if (key === FREE_KEY) return null;
  const [leagueSlug, tournamentSlug] = key.slice(FREE_KEY.length + 1).split("/");
  return { leagueSlug, tournamentSlug };
}

function sanitizePokemon(value: unknown): StoredPlanPokemon | null {
  const data = record(value);
  if (!data || typeof data.id !== "string" || !data.id) return null;
  return {
    id: text(data.id),
    tier: text(data.tier),
    value:
      typeof data.value === "number" && Number.isFinite(data.value)
        ? data.value
        : null,
    ...(typeof data.locked === "boolean" ? { locked: data.locked } : {}),
  };
}

export function sanitizePlans(value: unknown): StoredPlan[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_PLANS).flatMap((entry) => {
    const data = record(entry);
    if (!data) return [];
    const team = Array.isArray(data.team)
      ? data.team
          .slice(0, MAX_TEAM)
          .flatMap((pokemon) => sanitizePokemon(pokemon) ?? [])
      : [];
    return [
      {
        format: text(data.format),
        ruleset: text(data.ruleset),
        draftName: text(data.draftName),
        min: number(data.min),
        max: number(data.max),
        system: text(data.system),
        totalPoints: number(data.totalPoints),
        team,
        ...(Array.isArray(data.baseline)
          ? {
              baseline: data.baseline
                .filter((id): id is string => typeof id === "string")
                .slice(0, MAX_TEAM)
                .map(text),
            }
          : {}),
      },
    ];
  });
}
