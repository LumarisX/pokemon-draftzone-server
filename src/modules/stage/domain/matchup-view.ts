import {
  MatchResultEntity,
  MatchupReportEntity,
} from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { PopulatedTeam } from "@modules/team/team.repository";
import { ScheduleViewOptions, toScheduleMatchup } from "./schedule-view";
import { PopulatedStageMatchup } from "./standings";

export type MatchupSideKey = "side1" | "side2";

export interface MatchupViewer {
  side: MatchupSideKey | null;
  isOrganizer: boolean;
  chatEnabled: boolean;
  coachReportingEnabled: boolean;
  canChat: boolean;
  canReport: boolean;
  canReview: boolean;
  canSchedule: boolean;
}

export interface MatchupDetailOptions extends ScheduleViewOptions {
  stage: { id: string; slug: string; name: string };
  round: { name: string; matchDeadline?: Date; bestOf?: number } | null;
  viewer: MatchupViewer;
}

function resultsView(results: MatchResultEntity[]) {
  return results.map((result) => ({
    link: result.replay,
    team1: {
      team: Object.fromEntries(result.side1.pokemon.entries()),
      score: result.side1.score,
      winner: result.winner === "side1",
    },
    team2: {
      team: Object.fromEntries(result.side2.pokemon.entries()),
      score: result.side2.score,
      winner: result.winner === "side2",
    },
  }));
}

function contactFor(team: PopulatedTeam, viewer: MatchupViewer) {
  const visible = viewer.isOrganizer || viewer.side !== null;
  return {
    coachId: team.coach._id.toString(),
    timezone: team.coach.timezone,
    ...(visible ? { discordName: team.coach.discordName } : {}),
  };
}

function reportView(report: MatchupReportEntity) {
  return {
    submittedBy: report.submittedBy,
    submittedByName: report.submittedByName ?? "A coach",
    submittedAt: report.submittedAt,
    teamId: report.team?.toString(),
    score: {
      team1: report.side1Score ?? 0,
      team2: report.side2Score ?? 0,
    },
    winner: report.winner,
    forfeit: report.forfeit ?? false,
    notes: report.notes,
    side1Paste: report.side1Paste,
    side2Paste: report.side2Paste,
    matches: resultsView(report.results ?? []),
  };
}

export function toMatchupDetail(
  matchup: PopulatedStageMatchup & {
    side1: { team: PopulatedTeam };
    side2: { team: PopulatedTeam };
  },
  options: MatchupDetailOptions,
) {
  const base = toScheduleMatchup(matchup, options);
  const { viewer } = options;

  return {
    ...base,
    team1: {
      ...base.team1,
      ...contactFor(matchup.side1.team, viewer),
      paste: matchup.side1.paste,
    },
    team2: {
      ...base.team2,
      ...contactFor(matchup.side2.team, viewer),
      paste: matchup.side2.paste,
    },
    label: matchup.label ?? base.label,
    notes: matchup.notes,
    scheduledDate: matchup.scheduledDate,
    forfeit: matchup.forfeit ?? false,
    status: matchup.status,
    stage: options.stage,
    round: options.round,
    viewer,
    report:
      matchup.report && (viewer.isOrganizer || viewer.side !== null)
        ? reportView(matchup.report)
        : undefined,
  };
}
