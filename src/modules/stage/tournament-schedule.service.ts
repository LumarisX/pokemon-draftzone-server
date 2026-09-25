import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { MatchupReportEntity } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { can } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { buildMatchLabels } from "./domain/match-labels";
import { scheduleMatchups } from "./domain/schedule-view";
import { rosterContext } from "./domain/stage-axis";
import { PopulatedStageMatchup } from "./domain/standings";
import { StageRepository } from "./stage.repository";

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
    private readonly advancement: BracketAdvancementService,
  ) {}

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
    const canSeeHidden = can(tournament, options.sub, "viewHidden");
    const canReviewResults = can(tournament, options.sub, "manageResults");
    const canManageSchedule = can(tournament, options.sub, "manageSchedule");

    const stages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const stageById = new Map(
      stages.map((stage) => [stage._id.toString(), stage]),
    );

    const teamIds = await this.teamRepo.findIdsBySlugs(
      tournament.id,
      (Array.isArray(options.teamSlug)
        ? options.teamSlug
        : [options.teamSlug]
      ).filter((slug): slug is string => Boolean(slug)),
    );
    const hasTeamFilter = options.teamSlug !== undefined;

    const axis = tournament.rounds;
    const currentIndex = tournament.currentRoundIndex;

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

    const matchLabels = buildMatchLabels(
      await this.matchupRepo.findLabelFieldsByStages(
        stages.map((stage) => stage._id),
      ),
      new Map(axis.map((round, index) => [round._id.toString(), index])),
    );

    const blockedMatchIds = canManageSchedule
      ? await this.advancement.findBlocked(stages.map((stage) => stage._id))
      : undefined;

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

    const roster = rosterContext(tournament);

    const view = axis
      .map((round, roundIndex) => ({ round, roundIndex }))
      .filter(({ round }) => rounds.some((r) => r._id.equals(round._id)))
      .map(({ round, roundIndex }) => {
        const stagesInRound = byRound.get(round._id.toString()) ?? new Map();
        return {
          _id: round._id,
          name: round.name,
          matchDeadline: round.matchDeadline ?? null,
          stages: [...stagesInRound.entries()]
            .map(([stageId, stageMatchups]) => ({
              stage: stageById.get(stageId),
              stageMatchups,
            }))
            .filter((entry) => entry.stage)
            .sort((a, b) => a.stage!.order - b.stage!.order)
            .map(({ stage, stageMatchups }) => {
              const scheduled = scheduleMatchups(stageMatchups, {
                roster,
                roundIndex,
                forfeitGameDiff: tournament.forfeit.gameDiff,
                keepUnresolvedOpponent: hasTeamFilter,
                matchLabels,
                blockedMatchIds,
              });
              if (!canReviewResults) {
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
      rounds: hasTeamFilter
        ? view.filter((round) => round.stages.length > 0)
        : view,
      currentRoundIndex: currentIndex,
    };
  }
}
