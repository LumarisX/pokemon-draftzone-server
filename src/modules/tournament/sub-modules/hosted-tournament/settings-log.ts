import { HostedTournament } from "./hosted-tournament.domain";
import {
  LockableSection,
  UpdateHostedTournamentSettingsDto,
} from "./hosted-tournament.dto";

export const SECTION_LABELS: Record<LockableSection, string> = {
  draft: "Draft Rules",
  standings: "Standings",
};

export type SettingChange = {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
};

type Watched = {
  field: keyof UpdateHostedTournamentSettingsDto;
  label: string;
  before: (tournament: HostedTournament, tierName: TierName) => unknown;
  after?: (
    dto: UpdateHostedTournamentSettingsDto,
    tierName: TierName,
  ) => unknown;
};

type TierName = (tierId: string) => string;

const day = (value: Date | undefined | null) =>
  value ? new Date(value).toISOString() : null;

const requirements = (
  list: { tierId: string; required: number; max?: number | null }[] | undefined,
  tierName: TierName,
) =>
  (list ?? [])
    .map((entry) => ({
      tier: tierName(entry.tierId),
      required: entry.required,
      max: entry.max ?? null,
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

const WATCHED: Watched[] = [
  {
    field: "draftCount",
    label: "Roster size",
    before: (t) => ({ min: t.draftCount.min, max: t.draftCount.max }),
    after: (dto) => ({ min: dto.draftCount!.min, max: dto.draftCount!.max }),
  },
  { field: "pointTotal", label: "Point total", before: (t) => t.pointTotal ?? null },
  {
    field: "tierRequirements",
    label: "Tier requirements",
    before: (t, tierName) => requirements(t.tierRequirements, tierName),
    after: (dto, tierName) => requirements(dto.tierRequirements, tierName),
  },
  {
    field: "tradePointLimit",
    label: "Trade point limit",
    before: (t) => t.tradePointLimit ?? null,
  },
  {
    field: "standingsRules",
    label: "Standings rules",
    before: (t) => t.effectiveStandingsRules(),
    after: (dto) => dto.standingsRules,
  },
  { field: "forfeit", label: "Forfeit scores", before: (t) => ({ ...t.forfeit }) },
  { field: "diffMode", label: "Differential", before: (t) => t.diffMode },
  { field: "maxTeams", label: "Team cap", before: (t) => t.maxTeams ?? null },
  {
    field: "signUpDeadline",
    label: "Sign-up deadline",
    before: (t) => day(t.signUpDeadline),
    after: (dto) => day(dto.signUpDeadline),
  },
  {
    field: "draftStart",
    label: "Draft start",
    before: (t) => day(t.draftStart),
    after: (dto) => day(dto.draftStart),
  },
  {
    field: "draftEnd",
    label: "Draft end",
    before: (t) => day(t.draftEnd),
    after: (dto) => day(dto.draftEnd),
  },
  {
    field: "seasonStart",
    label: "Season start",
    before: (t) => day(t.seasonStart),
    after: (dto) => day(dto.seasonStart),
  },
  {
    field: "seasonEnd",
    label: "Season end",
    before: (t) => day(t.seasonEnd),
    after: (dto) => day(dto.seasonEnd),
  },
  { field: "signUpAccess", label: "Sign-up access", before: (t) => t.signUpAccess },
  {
    field: "matchSettings",
    label: "Match settings",
    before: (t) => ({
      chat: t.matchSettings?.chat !== false,
      coachReporting: t.matchSettings?.coachReporting !== false,
    }),
    after: (dto) => ({
      chat: dto.matchSettings?.chat !== false,
      coachReporting: dto.matchSettings?.coachReporting !== false,
    }),
  },
  {
    field: "logVisibility",
    label: "Log visibility",
    before: (t) => t.logVisibility ?? "participants",
  },
];

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function settingsChanges(
  tournament: HostedTournament,
  dto: UpdateHostedTournamentSettingsDto,
  tierName: TierName,
): SettingChange[] {
  const changes: SettingChange[] = [];
  for (const watched of WATCHED) {
    if (dto[watched.field] === undefined) continue;
    const before = watched.before(tournament, tierName);
    const after = watched.after
      ? watched.after(dto, tierName)
      : (dto[watched.field] ?? null);
    if (!same(before, after))
      changes.push({ field: watched.field, label: watched.label, before, after });
  }
  return changes;
}

export function describeChanges(changes: SettingChange[]): string {
  const labels = changes.map(
    (change) => change.label.charAt(0).toLowerCase() + change.label.slice(1),
  );
  if (labels.length <= 3) return `Changed ${labels.join(", ")}`;
  return `Changed ${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;
}
