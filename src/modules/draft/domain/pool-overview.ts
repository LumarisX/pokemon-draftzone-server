import { getName } from "@modules/data/domain/pokedex";
import {
  PopulatedDraft,
  PopulatedTeam,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { canOnTeam } from "@modules/tournament/membership";
import { isStaff } from "@modules/tournament/tournament-policy";
import {
  calculateCanDraftCounts,
  generatePickOrder,
  getCurrentPickingTeam,
  getDocumentId,
  getDraftOrder,
  getPokemonIdFromDraft,
  isPreDraftStatus,
} from "./pick-order";
import { canSeeAllPicks } from "./pick-visibility";

const RECENT_PICK_COUNT = 4;
const MIN_CONSIDERED_GAP_SECONDS = 2;
const MIN_CONSIDERED_SHARE = 0.2;

type PoolStatus = "PRE_DRAFT" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";

export type PoolTeamRef = {
  id: string;
  slug: string;
  name: string;
  logo?: string;
};

export type PoolOverview = {
  poolSlug: string;
  name: string;
  status: PoolStatus;
  sequentialTurns: boolean;
  picksHidden: boolean;
  teamCount: number;
  rounds: number;
  progress?: { done: number; total: number };
  currentRound?: number;
  onTheClock?: PoolTeamRef;
  skipTime?: Date;
  noTimer: boolean;
  draftStart?: Date;
  completedAt?: Date;
  yourTeam?: PoolTeamRef;
  yourPickIn?: number;
  recentPicks: {
    pokemon: { id: string; name: string };
    team: PoolTeamRef;
    round: number;
    timestamp: Date;
  }[];
  pace: {
    medianPickSeconds?: number;
    snipes?: number;
  };
};

function teamRef(team: PopulatedTeam): PoolTeamRef {
  return {
    id: getDocumentId(team),
    slug: team.slug,
    name: team.teamName,
    logo: team.logo,
  };
}

function poolStatus(status: string): PoolStatus {
  return isPreDraftStatus(status) ? "PRE_DRAFT" : (status as PoolStatus);
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function timedPicks(draft: PopulatedDraft) {
  return draft.teams
    .flatMap((team) =>
      team.pickLog.flatMap((pick, round) =>
        pick.timestamp
          ? [
              {
                team,
                round,
                pokemonId: getPokemonIdFromDraft(pick),
                timestamp: new Date(pick.timestamp),
              },
            ]
          : [],
      ),
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function medianPickSeconds(timestamps: Date[]): number | undefined {
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push((timestamps[i].getTime() - timestamps[i - 1].getTime()) / 1000);
  }
  const considered = gaps.filter((gap) => gap >= MIN_CONSIDERED_GAP_SECONDS);
  if (considered.length < Math.max(2, gaps.length * MIN_CONSIDERED_SHARE))
    return undefined;
  const value = median(considered);
  return value === undefined ? undefined : Math.round(value);
}

function draftProgress(
  draft: PopulatedDraft,
  status: PoolStatus,
  rounds: number,
): PoolOverview["progress"] {
  const total = draft.teams.length * rounds;
  if (!total) return undefined;
  if (status === "PRE_DRAFT") return { done: 0, total };
  if (status === "COMPLETED") return { done: total, total };
  const done = draft.sequentialTurns
    ? draft.counter
    : draft.teams.reduce(
        (sum, team) => sum + Math.min(team.pickLog.length, rounds),
        0,
      );
  return { done: Math.min(done, total), total };
}

function picksUntilYourTurn(
  draft: PopulatedDraft,
  rounds: number,
  yourTeam: PopulatedTeam,
): number | undefined {
  const pickOrder = generatePickOrder(
    getDraftOrder(draft),
    rounds,
    draft.orderProgression,
  );
  const yourId = getDocumentId(yourTeam);
  if ((calculateCanDraftCounts(draft, pickOrder)[yourId] ?? 0) > 0) return 0;
  for (let i = draft.counter; i < pickOrder.length; i++) {
    if (getDocumentId(pickOrder[i]) === yourId) return i - draft.counter;
  }
  return undefined;
}

export function isTournamentMember(
  tournament: PopulatedTournament,
  teams: PopulatedTeam[],
  sub: string | undefined,
): boolean {
  if (!sub) return false;
  if (isStaff(tournament, sub)) return true;
  return teams.some(
    (team) => team.status === "approved" && canOnTeam(team, sub, "chat"),
  );
}

export function summarizePool(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  sub: string | undefined,
): PoolOverview {
  const status = poolStatus(draft.status);
  const rounds = tournament.draftCount.max;
  const teamCount = draft.teams.length;
  const live = status === "IN_PROGRESS" || status === "PAUSED";
  const sequentialLive = live && draft.sequentialTurns && teamCount > 0;
  const yourTeam = draft.teams.find((team) => canOnTeam(team, sub, "draft"));
  const picksHidden = !canSeeAllPicks(tournament, draft, sub);

  const picks = timedPicks(draft);
  const onTheClock = sequentialLive ? getCurrentPickingTeam(draft) : null;

  return {
    poolSlug: draft.slug,
    name: draft.name,
    status,
    sequentialTurns: draft.sequentialTurns,
    picksHidden,
    teamCount,
    rounds,
    progress: draftProgress(draft, status, rounds),
    ...(sequentialLive
      ? {
          currentRound: Math.min(
            Math.floor(draft.counter / teamCount),
            rounds - 1,
          ),
        }
      : {}),
    ...(onTheClock ? { onTheClock: teamRef(onTheClock) } : {}),
    ...(live && draft.skipTime ? { skipTime: draft.skipTime } : {}),
    noTimer: draft.noTimer,
    draftStart: draft.draftStart,
    ...(status === "COMPLETED" && picks.length
      ? { completedAt: picks[picks.length - 1].timestamp }
      : {}),
    ...(yourTeam ? { yourTeam: teamRef(yourTeam) } : {}),
    ...(sequentialLive && yourTeam
      ? { yourPickIn: picksUntilYourTurn(draft, rounds, yourTeam) }
      : {}),
    recentPicks: picksHidden
      ? []
      : picks
          .slice(-RECENT_PICK_COUNT)
          .reverse()
          .map((pick) => ({
            pokemon: { id: pick.pokemonId, name: getName(pick.pokemonId) },
            team: teamRef(pick.team),
            round: pick.round,
            timestamp: pick.timestamp,
          })),
    pace: {
      medianPickSeconds: draft.sequentialTurns
        ? medianPickSeconds(picks.map((pick) => pick.timestamp))
        : undefined,
      snipes: draft.snipeCount,
    },
  };
}
