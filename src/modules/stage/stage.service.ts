import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { ID } from "@pkmn/data";
import { Types } from "mongoose";
import {
  ExternalMatchup,
  MatchupSide,
} from "@modules/matchup/sub-modules/external-matchup/external-matchup.domain";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import {
  LeagueMatchupDocument,
  MatchResultEntity,
  PokemonResultStatsEntity,
} from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { isCoachedBy } from "@modules/team/team.domain";
import { actingCoach } from "@modules/tournament/membership";
import { PopulatedTeam } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { assertCan, can } from "@modules/tournament/tournament-policy";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable } from "@nestjs/common";
import { MatchupAdvancement } from "./domain/advancement";
import { MatchupViewer, toMatchupDetail } from "./domain/matchup-view";
import { getRosterByRound } from "./domain/roster";
import {
  AxisTournament,
  rosterContext,
  RosterContext,
} from "./domain/stage-axis";
import {
  hasResolvedSides,
  PopulatedStageMatchup,
} from "./domain/standings";
import {
  MatchResultDto,
  PokemonResultDto,
  SetMatchupNotesDto,
  SetMatchupScheduleDto,
  SubmitMatchupReportDto,
} from "./stage.dto";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { StageRepository } from "./stage.repository";
import { StageDocument } from "./stage.schema";

@Injectable()
export class StageService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly advancement: BracketAdvancementService,
  ) {}

  private async assertStageVisible(
    stage: StageDocument,
    sub?: string,
  ): Promise<StageDocument> {
    if (stage.public !== false) return stage;
    if (sub) {
      const tournament = await this.hostedTournamentRepo.findById(
        stage.tournamentId,
      );
      if (can(tournament, sub, "viewHidden")) return stage;
    }
    throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageSlug: stage.slug });
  }

  async listStages(leagueSlug: string, tournamentSlug: string, sub?: string) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const stages = await this.stageRepo.findAllByTournament(tournament.id);
    const canSeeHidden = can(tournament, sub, "viewHidden");

    return stages
      .filter((stage) => stage.public !== false || canSeeHidden)
      .map((stage) => ({
        _id: stage._id.toString(),
        slug: stage.slug,
        name: stage.name,
        type: stage.type,
        order: stage.order,
        public: stage.public !== false,
      }));
  }

  async getMatchupAnalysis(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const { stageDoc, tournament, matchupDoc } = await this.resolveMatchup(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );

    const ruleset = tournament.requireRuleset("matchupAnalysis");
    const format = tournament.requireFormat("matchupAnalysis");

    const tierList = await this.tierListRepo
      .findById(tournament.tierListId)
      .catch(() => undefined);

    const rosterCtx = rosterContext(tournament);
    const { roundIndex, roundDoc } = this.matchupRound(tournament, matchupDoc);

    const toSide = (side: {
      team: PopulatedTeam;
      notes?: string;
    }): MatchupSide => {
      const roster = getRosterByRound(
        side.team,
        rosterCtx,
        roundIndex === -1 ? undefined : roundIndex,
      );
      const team: PDZPokemon[] = [];
      for (const pokemon of roster) {
        try {
          team.push(
            new PDZPokemon(
              {
                id: pokemon.id,
                capt: pokemon.addons?.includes("Tera Captain")
                  ? { tera: [] }
                  : undefined,
                draftFormes: tierList?.getPokemonFormeIds(pokemon.id) as
                  ID[] | undefined,
              },
              ruleset,
            ),
          );
        } catch {
          continue;
        }
      }
      return {
        team,
        teamName: side.team.teamName,
        coach: side.team.primaryCoach.name,
        owner: side.team.primaryCoach?.auth0Id,
        notes: side.notes,
      };
    };

    const matchup = new ExternalMatchup({
      ruleset,
      format,
      tournamentName: tournament.name,
      stage: roundDoc?.name ?? stageDoc.name,
      aTeam: toSide(matchupDoc.side1),
      bTeam: toSide(matchupDoc.side2),
    });
    return matchup.analyze(sub);
  }

  private async resolveMatchup(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const matchupDoc = (await this.matchupRepo.findBySlugPopulated(
      tournament.id,
      matchupSlug,
    )) as unknown as PopulatedStageMatchup;

    const stageDoc = matchupDoc.stage
      ? await this.stageRepo.findByIdOrNull(matchupDoc.stage)
      : null;
    if (!stageDoc || stageDoc.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug });
    await this.assertStageVisible(stageDoc, sub);

    if (!hasResolvedSides(matchupDoc))
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug });

    return { stageDoc, tournament, matchupDoc };
  }

  private async loadMatchupContext(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const { stageDoc, tournament, matchupDoc } = await this.resolveMatchup(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );

    const isOrganizer = can(tournament, sub, "manageResults");
    const side = !sub
      ? null
      : isCoachedBy(matchupDoc.side1.team, sub, "report")
        ? ("side1" as const)
        : isCoachedBy(matchupDoc.side2.team, sub, "report")
          ? ("side2" as const)
          : null;

    const chatEnabled = tournament.matchSettings?.chat !== false;
    const coachReportingEnabled =
      tournament.matchSettings?.coachReporting !== false;

    const viewer: MatchupViewer = {
      side,
      isOrganizer,
      chatEnabled,
      coachReportingEnabled,
      canChat: chatEnabled && (isOrganizer || side !== null),
      canReport: isOrganizer || (coachReportingEnabled && side !== null),
      canReview: isOrganizer,
      canSchedule: isOrganizer || side !== null,
    };

    return { stageDoc, tournament, matchupDoc, viewer };
  }

  private assertMatchupParticipant(viewer: MatchupViewer) {
    if (!viewer.canChat) throw new PDZError(ErrorCodes.MATCHUP.NOT_PARTICIPANT);
  }

  async getMatchupDetail(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const { stageDoc, tournament, matchupDoc, viewer } =
      await this.loadMatchupContext(
        leagueSlug,
        tournamentSlug,
        matchupSlug,
        sub,
      );

    const { roundIndex, roundDoc } = this.matchupRound(tournament, matchupDoc);

    return toMatchupDetail(matchupDoc, {
      roster: rosterContext(tournament),
      roundIndex,
      forfeitGameDiff: tournament.forfeit.gameDiff,
      stage: {
        id: stageDoc._id.toString(),
        slug: stageDoc.slug,
        name: stageDoc.name,
      },
      round: roundDoc
        ? {
            name: roundDoc.name,
            matchDeadline: roundDoc.matchDeadline,
          }
        : null,
      viewer,
    });
  }

  async setMatchupSchedule(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    dto: SetMatchupScheduleDto,
  ) {
    const { matchupDoc, viewer } = await this.loadMatchupContext(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
    if (!viewer.canSchedule)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_PARTICIPANT);

    matchupDoc.scheduledDate = dto.scheduledDate
      ? new Date(dto.scheduledDate)
      : undefined;
    await matchupDoc.save();

    return {
      message: dto.scheduledDate ? "Match time set" : "Match time cleared",
      scheduledDate: matchupDoc.scheduledDate?.toISOString() ?? null,
    };
  }

  async setMatchupNotes(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    dto: SetMatchupNotesDto,
  ) {
    const { matchupDoc, viewer } = await this.loadMatchupContext(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
    if (viewer.side === null)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_PARTICIPANT);

    const notes = dto.notes?.trim() || undefined;
    matchupDoc[viewer.side].notes = notes;
    await matchupDoc.save();

    return { message: notes ? "Notes saved" : "Notes cleared" };
  }

  async submitMatchupReport(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    dto: SubmitMatchupReportDto,
  ) {
    const { tournament, matchupDoc, viewer } = await this.loadMatchupContext(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
    if (!viewer.isOrganizer && viewer.side === null)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_PARTICIPANT);
    if (!viewer.isOrganizer && !viewer.coachReportingEnabled)
      throw new PDZError(ErrorCodes.MATCHUP.REPORTING_DISABLED);

    const results = this.buildMatchResults(dto.matches);
    this.assertResultsOnRoster(
      results,
      matchupDoc,
      rosterContext(tournament),
      this.matchupRound(tournament, matchupDoc).roundIndex,
    );
    const score = dto.score ?? this.tallyScore(results);
    const winner = dto.winner ?? this.tallyWinner(score);
    const side1Paste = dto.side1Paste?.trim() || undefined;
    const side2Paste = dto.side2Paste?.trim() || undefined;

    if (viewer.isOrganizer) {
      matchupDoc.results = results;
      matchupDoc.side1.score = score.team1;
      matchupDoc.side2.score = score.team2;
      matchupDoc.side1.paste = side1Paste;
      matchupDoc.side2.paste = side2Paste;
      matchupDoc.winner = winner;
      matchupDoc.forfeit = dto.forfeit ?? false;
      matchupDoc.status = "approved";
      matchupDoc.report = undefined;
      await matchupDoc.save();
      await this.advanceBracket(matchupDoc);
      return { message: "Result recorded.", status: "approved" as const };
    }

    if (matchupDoc.status === "approved")
      throw new PDZError(ErrorCodes.MATCHUP.ALREADY_APPROVED, { matchupSlug });

    const reportingSide =
      viewer.side === "side1" ? matchupDoc.side1 : matchupDoc.side2;
    const reportingTeam = reportingSide.team!;
    const reporter =
      actingCoach(reportingTeam, sub, "report") ?? reportingTeam.primaryCoach;

    matchupDoc.report = {
      team: reportingTeam._id,
      submittedBy: sub,
      submittedByName: reporter.name,
      submittedAt: new Date(),
      results,
      side1Score: score.team1,
      side2Score: score.team2,
      winner,
      forfeit: dto.forfeit || undefined,
      notes: dto.notes?.trim() || undefined,
      side1Paste,
      side2Paste,
    };
    matchupDoc.status = "pending";
    await matchupDoc.save();

    return {
      message: "Result submitted for review.",
      status: "pending" as const,
    };
  }

  async reviewMatchupReport(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    approve: boolean,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageResults");

    const { matchupDoc } = await this.loadMatchupContext(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
    const report = matchupDoc.report;
    if (!report)
      throw new PDZError(ErrorCodes.MATCHUP.NO_REPORT, { matchupSlug });

    if (!approve) {
      matchupDoc.report = undefined;
      matchupDoc.status = matchupDoc.winner ? "approved" : undefined;
      await matchupDoc.save();
      return { message: "Report rejected.", status: "rejected" as const };
    }

    matchupDoc.results = report.results.map((result) => ({
      replay: result.replay,
      winner: result.winner,
      side1: {
        score: result.side1.score,
        pokemon: new Map(result.side1.pokemon),
      },
      side2: {
        score: result.side2.score,
        pokemon: new Map(result.side2.pokemon),
      },
    }));
    matchupDoc.side1.score = report.side1Score ?? 0;
    matchupDoc.side2.score = report.side2Score ?? 0;
    matchupDoc.side1.paste = report.side1Paste ?? matchupDoc.side1.paste;
    matchupDoc.side2.paste = report.side2Paste ?? matchupDoc.side2.paste;
    matchupDoc.winner =
      report.winner ??
      this.tallyWinner({
        team1: report.side1Score ?? 0,
        team2: report.side2Score ?? 0,
      });
    matchupDoc.forfeit = report.forfeit ?? false;
    matchupDoc.status = "approved";
    matchupDoc.report = undefined;
    await matchupDoc.save();
    await this.advanceBracket(matchupDoc);

    return { message: "Report approved.", status: "approved" as const };
  }

  private buildMatchResults(matches: MatchResultDto[]): MatchResultEntity[] {
    const toStats = (
      pokemon: Map<string, PokemonResultDto>,
    ): Map<string, PokemonResultStatsEntity> =>
      new Map(
        [...pokemon].map(([id, stats]) => [
          id,
          {
            status: stats.status,
            kills: stats.kills
              ? {
                  direct: stats.kills.direct,
                  indirect: stats.kills.indirect,
                  teammate: stats.kills.teammate,
                }
              : undefined,
          },
        ]),
      );

    return matches.map((match) => ({
      replay: match.link,
      winner: match.winner,
      side1: { score: match.team1.score, pokemon: toStats(match.team1.pokemon) },
      side2: { score: match.team2.score, pokemon: toStats(match.team2.pokemon) },
    }));
  }

  private matchupRound(
    tournament: AxisTournament,
    matchupDoc: { round?: Types.ObjectId },
  ) {
    const rounds = tournament.rounds ?? [];
    const roundIndex = matchupDoc.round
      ? rounds.findIndex((round) => round._id.equals(matchupDoc.round!))
      : -1;
    return {
      roundIndex,
      roundDoc: roundIndex === -1 ? undefined : rounds[roundIndex],
    };
  }

  private assertResultsOnRoster(
    results: MatchResultEntity[],
    matchupDoc: {
      side1: { team: PopulatedTeam };
      side2: { team: PopulatedTeam };
    },
    rosterCtx: RosterContext,
    roundIndex: number,
  ) {
    for (const side of ["side1", "side2"] as const) {
      const roster = new Set(
        getRosterByRound(matchupDoc[side].team, rosterCtx, roundIndex).map(
          (pokemon) => pokemon.id,
        ),
      );
      for (const result of results)
        for (const pokemon of result[side].pokemon.keys())
          if (!roster.has(pokemon))
            throw new PDZError(ErrorCodes.MATCHUP.NOT_ON_ROSTER, {
              side,
              pokemon,
            });
    }
  }

  private tallyScore(results: MatchResultEntity[]) {
    return results.reduce(
      (totals, result) => ({
        team1: totals.team1 + (result.winner === "side1" ? 1 : 0),
        team2: totals.team2 + (result.winner === "side2" ? 1 : 0),
      }),
      { team1: 0, team2: 0 },
    );
  }

  private tallyWinner(score: { team1: number; team2: number }) {
    if (score.team1 > score.team2) return "side1" as const;
    if (score.team2 > score.team1) return "side2" as const;
    return "draw" as const;
  }

  private async advanceBracket(matchup: LeagueMatchupDocument) {
    if (!matchup.stage) return;
    const stageDoc = await this.stageRepo.findByIdOrNull(matchup.stage);
    if (!stageDoc) return;
    await this.advancement.applyToTournament(stageDoc.tournamentId);
  }

  async setMatchupAdvancement(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    advances: MatchupAdvancement | null,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSchedule");

    const matchup = await this.matchupRepo.findBySlug(tournament.id, matchupSlug);
    const stageDoc = matchup.stage
      ? await this.stageRepo.findByIdOrNull(matchup.stage)
      : null;
    if (!stageDoc || stageDoc.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug });

    matchup.advances = advances ?? undefined;
    await matchup.save();

    const changed = await this.advancement.applyToTournament(
      stageDoc.tournamentId,
    );

    return {
      message:
        advances === null
          ? `Advancement cleared; ${changed} bracket slot(s) updated.`
          : advances === "none"
            ? `No team advances from this match; ${changed} bracket slot(s) updated.`
            : `Advancement set; ${changed} bracket slot(s) updated.`,
      advances: advances ?? null,
    };
  }
}
