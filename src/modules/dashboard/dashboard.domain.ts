import { FormResult, SeasonPhase } from "@modules/league/my-league-entry";
import { MySeasonsService } from "@modules/league/my-seasons.service";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ExternalTournament } from "@modules/tournament/sub-modules/external-tournament/external-tournament.domain";

type HostedSeason = Awaited<
  ReturnType<MySeasonsService["hosted"]>
>["tournaments"][number];

export type DashboardNext = {
  round: string;
  when: string | null;
  exactTime: boolean;
  matchupSlug: string | null;
  matchupId: string | null;
  opponent: {
    name: string;
    coach: string | null;
    logo: string | null;
    teamSlug: string | null;
  } | null;
};

export type DashboardDraft = {
  picksMade: number;
  rosterSize: number | null;
  onClock: boolean;
  round: number | null;
  pick: number | null;
  deadline: string | null;
};

export type DashboardTeam = {
  id: string;
  kind: "hosted" | "external";
  teamName: string;
  logo: string | null;
  leagueName: string;
  tournamentName: string | null;
  format: string | null;
  ruleset: string | null;
  pokemon: unknown[];
  phase: SeasonPhase;
  record: { wins: number; draws: number; losses: number } | null;
  form: FormResult[];
  standing: { rank: number; of: number } | null;
  next: DashboardNext | null;
  draft: DashboardDraft | null;
  startsAt: string | null;
  hosted: {
    leagueSlug: string;
    tournamentSlug: string;
    teamSlug: string;
    poolSlug: string | null;
  } | null;
  external: { slug: string } | null;
};

export type UpNextKind = "pick" | "match" | "draftStart";

export type UpNextItem = {
  kind: UpNextKind;
  teamId: string;
  when: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const MATCH_WINDOW_MS = 72 * HOUR_MS;
const DRAFT_WINDOW_MS = 7 * 24 * HOUR_MS;

const PHASE_ORDER: Record<SeasonPhase, number> = {
  drafting: 0,
  season: 1,
  upcoming: 2,
  completed: 3,
};

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}

function within(value: string | null, windowMs: number, now: number): boolean {
  if (!value) return false;
  const delta = new Date(value).getTime() - now;
  return delta > -HOUR_MS && delta < windowMs;
}

export function hostedTeam(season: HostedSeason): DashboardTeam {
  const draft = season.draftState;
  return {
    id: `hosted:${season.teamId}`,
    kind: "hosted",
    teamName: season.teamName,
    logo: season.logo ?? null,
    leagueName: season.leagueName,
    tournamentName: season.tournamentName,
    format: season.format,
    ruleset: season.ruleset,
    pokemon: season.draft,
    phase: season.phase,
    record: season.score
      ? {
          wins: season.score.wins,
          draws: season.score.draws,
          losses: season.score.losses,
        }
      : null,
    form: season.form,
    standing: season.standing,
    next: season.next
      ? {
          round: season.next.round,
          when: season.next.when,
          exactTime: season.next.exactTime,
          matchupSlug: season.next.matchupSlug,
          matchupId: null,
          opponent: season.next.opponent,
        }
      : null,
    draft: draft
      ? {
          picksMade: draft.picksMade,
          rosterSize: draft.rosterSize,
          onClock: draft.onClock,
          round: draft.round,
          pick: draft.pick,
          deadline: draft.deadline,
        }
      : null,
    startsAt: season.startsAt ? season.startsAt.toISOString() : null,
    hosted: {
      leagueSlug: season.leagueSlug,
      tournamentSlug: season.tournamentSlug,
      teamSlug: season.teamSlug,
      poolSlug: season.poolSlug ?? null,
    },
    external: null,
  };
}

export function externalTeam(tournament: ExternalTournament): DashboardTeam {
  const score = tournament.getScore();
  const next = tournament.getNextMatch();
  const played = score.wins + score.losses > 0;
  return {
    id: `external:${tournament.slug}`,
    kind: "external",
    teamName: tournament.teamName,
    logo: null,
    leagueName: tournament.leagueName,
    tournamentName: null,
    format: tournament.format.name,
    ruleset: tournament.ruleset.name,
    pokemon: [
      ...tournament.team.map(PokemonMapper.toClientPayload),
      ...tournament.unresolvedTeam.map(PokemonMapper.toUnresolvedClientPayload),
    ],
    phase: "season",
    record: played ? { wins: score.wins, draws: 0, losses: score.losses } : null,
    form: tournament.getForm(),
    standing: null,
    next: next
      ? {
          round: next.round,
          when: next.when,
          exactTime: next.exactTime,
          matchupSlug: null,
          matchupId: next.matchupId,
          opponent: {
            name: next.opponent.name,
            coach: next.opponent.coach,
            logo: null,
            teamSlug: null,
          },
        }
      : null,
    draft: null,
    startsAt: null,
    hosted: null,
    external: { slug: tournament.slug },
  };
}

export function orderTeams(teams: DashboardTeam[]): DashboardTeam[] {
  return [...teams].sort(
    (a, b) =>
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      Number(!!b.draft?.onClock) - Number(!!a.draft?.onClock) ||
      time(a.next?.when ?? a.startsAt) - time(b.next?.when ?? b.startsAt),
  );
}

export function upNextFrom(
  teams: DashboardTeam[],
  now = Date.now(),
): UpNextItem[] {
  const items: UpNextItem[] = [];
  for (const team of teams) {
    if (team.draft?.onClock)
      items.push({ kind: "pick", teamId: team.id, when: team.draft.deadline });
    if (team.next && within(team.next.when, MATCH_WINDOW_MS, now))
      items.push({ kind: "match", teamId: team.id, when: team.next.when });
    if (team.phase === "upcoming" && within(team.startsAt, DRAFT_WINDOW_MS, now))
      items.push({ kind: "draftStart", teamId: team.id, when: team.startsAt });
  }
  return items.sort(
    (a, b) =>
      Number(b.kind === "pick") - Number(a.kind === "pick") ||
      time(a.when) - time(b.when),
  );
}
