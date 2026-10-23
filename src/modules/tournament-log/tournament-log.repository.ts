import {
  HostedTournamentDocument,
  HostedTournamentEntity,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  TournamentLogDocument,
  TournamentLogEntity,
  TournamentLogType,
} from "./tournament-log.schema";

export type NewLogEntry = {
  tournamentId: string;
  actor: string;
  actorName?: string;
  type: TournamentLogType;
  summary: string;
  target?: { kind: string; id?: string; name?: string };
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
  reason?: string;
};

export type LogQuery = {
  tournamentId: string;
  types?: TournamentLogType[];
  before?: number;
  limit: number;
};

@Injectable()
export class TournamentLogRepository {
  constructor(
    @InjectModel(TournamentLogEntity.name)
    private readonly logModel: Model<TournamentLogDocument>,
    @InjectModel(HostedTournamentEntity.name)
    private readonly tournamentModel: Model<HostedTournamentDocument>,
  ) {}

  async append(entry: NewLogEntry): Promise<TournamentLogDocument> {
    const tournamentId = new Types.ObjectId(entry.tournamentId);
    const counter = await this.tournamentModel
      .findOneAndUpdate(
        { _id: tournamentId },
        { $inc: { logSeq: 1 } },
        { returnDocument: "after", projection: { logSeq: 1 } },
      )
      .lean()
      .exec();
    const seq = (counter as { logSeq?: number } | null)?.logSeq ?? 1;
    const [doc] = await this.logModel.create([
      {
        tournament: tournamentId,
        seq,
        actor: entry.actor,
        actorName: entry.actorName,
        type: entry.type,
        summary: entry.summary,
        target: entry.target,
        before: entry.before,
        after: entry.after,
        details: entry.details,
        reason: entry.reason?.trim() || undefined,
      },
    ]);
    return doc;
  }

  async list(query: LogQuery): Promise<TournamentLogDocument[]> {
    const filter: Record<string, unknown> = {
      tournament: new Types.ObjectId(query.tournamentId),
    };
    if (query.types?.length) filter.type = { $in: query.types };
    if (query.before !== undefined) filter.seq = { $lt: query.before };
    return this.logModel
      .find(filter)
      .sort({ seq: -1 })
      .limit(query.limit)
      .exec();
  }

  async findBySeq(
    tournamentId: string,
    seq: number,
  ): Promise<TournamentLogDocument | null> {
    return this.logModel
      .findOne({ tournament: new Types.ObjectId(tournamentId), seq })
      .exec();
  }

  async latestOfTypes(
    tournamentId: string,
    types: TournamentLogType[],
  ): Promise<TournamentLogDocument | null> {
    return this.logModel
      .findOne({
        tournament: new Types.ObjectId(tournamentId),
        type: { $in: types },
      })
      .sort({ seq: -1 })
      .exec();
  }
}
