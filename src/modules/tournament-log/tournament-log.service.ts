import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { TeamRepository } from "@modules/team/team.repository";
import { canOnTeam } from "@modules/tournament/membership";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { can } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { TournamentLogRepository } from "./tournament-log.repository";
import {
  TOURNAMENT_LOG_TYPES,
  TournamentLogDocument,
  TournamentLogType,
} from "./tournament-log.schema";

export const LOG_PAGE_SIZE = 50;

export type LogEntryView = {
  seq: number;
  at?: Date;
  actorName: string | null;
  type: TournamentLogType;
  summary: string;
  target?: { kind: string; id?: string; name?: string };
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
  reason?: string;
};

@Injectable()
export class TournamentLogService {
  constructor(
    private readonly logRepo: TournamentLogRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly teamRepo: TeamRepository,
  ) {}

  async list(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string | undefined,
    query: { types?: string[]; before?: number; limit?: number },
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    await this.assertCanRead(tournament, sub);

    const types = (query.types ?? []).filter((type): type is TournamentLogType =>
      (TOURNAMENT_LOG_TYPES as readonly string[]).includes(type),
    );
    const limit = Math.min(query.limit ?? LOG_PAGE_SIZE, 100);
    const docs = await this.logRepo.list({
      tournamentId: tournament.id,
      types,
      before: query.before,
      limit: limit + 1,
    });
    const page = docs.slice(0, limit);

    return {
      entries: page.map(toView),
      next: docs.length > limit ? page[page.length - 1].seq : null,
      visibility: tournament.logVisibility ?? "participants",
    };
  }

  async assertCanRead(
    tournament: HostedTournament,
    sub: string | undefined,
  ): Promise<void> {
    if (tournament.logVisibility === "public") return;
    if (can(tournament, sub, "viewStaff")) return;
    if (sub) {
      const teams = await this.teamRepo.findAllByTournament(tournament.id);
      const coaches = teams.some(
        (team) => team.status === "approved" && canOnTeam(team, sub, "chat"),
      );
      if (coaches) return;
    }
    throw new PDZError(ErrorCodes.TOURNAMENT.LOG_HIDDEN, { tournamentSlug: tournament.slug });
  }
}

export function toView(doc: TournamentLogDocument): LogEntryView {
  return {
    seq: doc.seq,
    at: doc.createdAt,
    actorName: doc.actorName ?? null,
    type: doc.type,
    summary: doc.summary,
    ...(doc.target && {
      target: { kind: doc.target.kind, id: doc.target.id, name: doc.target.name },
    }),
    ...(doc.before !== undefined && { before: doc.before }),
    ...(doc.after !== undefined && { after: doc.after }),
    ...(doc.details && { details: doc.details }),
    ...(doc.reason && { reason: doc.reason }),
  };
}
