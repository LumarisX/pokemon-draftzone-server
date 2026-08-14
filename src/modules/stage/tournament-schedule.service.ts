import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { MatchupReportEntity } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { buildMatchLabels } from "./domain/match-labels";
import { scheduleMatchups } from "./domain/schedule-view";
import {
  rosterContext,
  tournamentRosterContext,
  usesTournamentAxis,
} from "./domain/stage-axis";
import { PopulatedStageMatchup } from "./domain/standings";
import { StageRepository } from "./stage.repository";

/**
 * The tournament's schedule: every round, with that round's matches grouped by
 * the stage they belong to.
 *
 * This is the shape the builder lays out — rounds down the side, stages across
 * — because they describe the same thing. A round is a slice of the season, and
 * within it a coach may have a group-phase match and a playoff match at once;
 * flattening those into one list loses which competition each belongs to.
 */
/** Only shown to organizers — a pending report's score/notes are not public. */
function reportSummary(report?: MatchupReportEntity) {
  if (!report) return undefined;
  return {
    submittedByName: report.submittedByName ?? "A coach",
    submittedAt: report.submittedAt,
    score: { team1: report.side1Score ?? 0, team2: report.side2Score ?? 0 },
    winner: report.winner,
    forfeit: report.forfeit ?? false,
    notes: report.notes,
  };
}

@Injectable()
export class TournamentScheduleService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly teamRepo: TeamRepository,
  ) {}

  private isOrganizer(tournament: HostedTournament, sub?: string): boolean {
    if (!sub) return false;
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  /**
   * @param teamSlug Restricts to a team's own matches, and drops the rounds it
   *   has none in — a coach's schedule is the weeks they actually play. Taken
   *   as a slug because that is what the team's page has in its URL; the
   *   matchups themselves are joined on the ObjectId behind it.
   * @param roundFilter `"current"` narrows to the round the tournament is on.
   */
  async getSchedule(
    leagueSlug: string,
    tournamentSlug: string,
    options: {
      teamSlug?: string | string[];
      roundFilter?: string;
      sub?: string;
    } = {},
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const canSeeHidden = this.isOrganizer(tournament, options.sub);

    const stages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const stageById = new Map(
      stages.map((stage) => [stage._id.toString(), stage]),
    );

    const teamIds = await this.teamRepo.findIdsBySlugs(
      (Array.isArray(options.teamSlug)
        ? options.teamSlug
        : [options.teamSlug]
      ).filter((slug): slug is string => Boolean(slug)),
    );
    const hasTeamFilter = options.teamSlug !== undefined;

    // Pre-migration a tournament has no axis of its own — each stage still
    // carries one. Concatenating them in stage order gives a whole-tournament
    // schedule for both shapes, so the client has one endpoint either way.
    // Rounds are not merged across stages here: their subdocument ids are
    // distinct, and guessing which are "the same week" is the migration's job,
    // not a read's.
    const axis = usesTournamentAxis(tournament)
      ? tournament.rounds
      : stages.flatMap((stage) => stage.rounds);
    const currentIndex = usesTournamentAxis(tournament)
      ? tournament.currentRoundIndex
      : axis.findIndex((round) =>
          stages.some((stage) =>
            stage.rounds[stage.currentRoundIndex]?._id.equals(round._id),
          ),
        );

    const currentOnly = options.roundFilter?.toLowerCase() === "current";
    const current = axis[currentIndex];
    const rounds = axis.filter(
      (round) => !currentOnly || (current && round._id.equals(current._id)),
    );

    const matchups = (await this.matchupRepo.findByRoundsAcrossStages(
      stages.map((stage) => stage._id),
      rounds.map((round) => round._id),
      hasTeamFilter ? { teamIds } : undefined,
    )) as unknown as PopulatedStageMatchup[];

    // Every card carries its bracket name, so the labels are always needed —
    // both for the card's own header and for the "Winner of Match 4" text on a
    // slot whose opponent has not been decided yet.
    const matchLabels = buildMatchLabels(
      await this.matchupRepo.findLabelFieldsByStages(
        stages.map((stage) => stage._id),
      ),
      new Map(axis.map((round, index) => [round._id.toString(), index])),
    );

    // round id -> stage id -> that stage's matchups in the round.
    const byRound = new Map<string, Map<string, PopulatedStageMatchup[]>>();
    for (const matchup of matchups) {
      if (!matchup.round || !matchup.stage) continue;
      const roundKey = matchup.round.toString();
      const stageKey = matchup.stage.toString();
      const stagesInRound = byRound.get(roundKey) ?? new Map();
      stagesInRound.set(stageKey, [
        ...(stagesInRound.get(stageKey) ?? []),
        matchup,
      ]);
      byRound.set(roundKey, stagesInRound);
    }

    // Rosters are resolved per stage, not once for the tournament. On a
    // migrated tournament every stage resolves to the same trades and the same
    // axis. Before that, each stage owns both — and its trades' `activeRound`
    // indexes *its* rounds, so walking them against the concatenated axis
    // would apply a later stage's trades far too early.
    const migrated = usesTournamentAxis(tournament);
    const rosterFor = (stageId: string) => {
      const stage = stageById.get(stageId);
      return migrated || !stage
        ? tournamentRosterContext(tournament)
        : rosterContext(stage, tournament);
    };
    const roundIndexFor = (stageId: string, globalIndex: number) => {
      if (migrated) return globalIndex;
      const stage = stageById.get(stageId);
      if (!stage) return globalIndex;
      const round = axis[globalIndex];
      return stage.rounds.findIndex((r) => r._id.equals(round._id));
    };

    const view = axis
      .map((round, roundIndex) => ({ round, roundIndex }))
      .filter(({ round }) => rounds.some((r) => r._id.equals(round._id)))
      .map(({ round, roundIndex }) => {
        const stagesInRound = byRound.get(round._id.toString()) ?? new Map();
        return {
          _id: round._id,
          name: round.name,
          matchDeadline: round.matchDeadline ?? null,
          // Stage order is the tournament's phase order, so a round reads
          // group phase first, playoffs after — the same top-to-bottom order
          // the builder shows.
          stages: [...stagesInRound.entries()]
            .map(([stageId, stageMatchups]) => ({
              stage: stageById.get(stageId),
              stageMatchups,
            }))
            .filter((entry) => entry.stage)
            .sort((a, b) => a.stage!.order - b.stage!.order)
            .map(({ stage, stageMatchups }) => {
              const stageId = stage!._id.toString();
              const scheduled = scheduleMatchups(stageMatchups, {
                roster: rosterFor(stageId),
                roundIndex: roundIndexFor(stageId, roundIndex),
                forfeitGameDiff: tournament.forfeit.gameDiff,
                keepUnresolvedOpponent: hasTeamFilter,
                matchLabels,
              });
              // Pending-report details are only useful to whoever can act on
              // them, so they ride along on this same list rather than
              // forcing the organizer to open every matchup individually.
              if (!canSeeHidden) {
                return {
                  _id: stage!._id,
                  slug: stage!.slug,
                  name: stage!.name,
                  type: stage!.type,
                  matchups: scheduled,
                };
              }
              const matchupsById = new Map<string, PopulatedStageMatchup>(
                stageMatchups.map((matchup: PopulatedStageMatchup) => [
                  matchup._id.toString(),
                  matchup,
                ]),
              );
              return {
                _id: stage!._id,
                slug: stage!.slug,
                name: stage!.name,
                type: stage!.type,
                matchups: scheduled.map((matchup) => {
                  const doc = matchupsById.get(matchup.id);
                  return {
                    ...matchup,
                    status: doc?.status,
                    report: reportSummary(doc?.report),
                  };
                }),
              };
            })
            .filter((stage) => stage.matchups.length > 0),
        };
      });

    return {
      // A team-scoped schedule only shows the rounds that team plays in. The
      // unfiltered view keeps every round, including empty ones, because an
      // organizer needs to see the gaps.
      rounds: hasTeamFilter
        ? view.filter((round) => round.stages.length > 0)
        : view,
      currentRoundIndex: currentIndex,
    };
  }
}
