import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";
import {
  ChatReportDocument,
  ChatReportEntity,
  ChatReportStatus,
} from "./chat-report.schema";

const DUPLICATE_KEY = 11000;
const LIST_LIMIT = 200;

export type NewChatReport = {
  message: Types.ObjectId;
  tournament: Types.ObjectId;
  channel: ChatReportEntity["channel"];
  target: string;
  reporter: string;
  reporterName: string;
  reason: string;
  messageText: string;
  messageAuthor: string;
  messageAuthorName: string;
  escalated: boolean;
};

@Injectable()
export class ChatReportRepository {
  constructor(
    @InjectModel(ChatReportEntity.name)
    private readonly reportModel: Model<ChatReportDocument>,
  ) {}

  async findOpen(
    message: Types.ObjectId | string,
    reporter: string,
  ): Promise<ChatReportDocument | null> {
    return this.reportModel
      .findOne({
        message: new Types.ObjectId(message),
        reporter: { $eq: reporter },
        status: "open",
      })
      .exec();
  }

  async createOrGetOpen(input: NewChatReport): Promise<ChatReportDocument> {
    try {
      return await this.reportModel.create(input);
    } catch (error) {
      if ((error as { code?: number } | null)?.code !== DUPLICATE_KEY)
        throw error;
      const existing = await this.findOpen(input.message, input.reporter);
      if (!existing) throw error;
      return existing;
    }
  }

  async findById(reportId: string): Promise<ChatReportDocument | null> {
    if (!isValidObjectId(reportId)) return null;
    return this.reportModel.findById(reportId).exec();
  }

  async listOpenForTournament(
    tournament: Types.ObjectId | string,
  ): Promise<ChatReportDocument[]> {
    return this.reportModel
      .find({
        tournament: new Types.ObjectId(tournament),
        status: "open",
        escalated: { $ne: true },
      })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .exec();
  }

  async listOpenEscalated(): Promise<ChatReportDocument[]> {
    return this.reportModel
      .find({ status: "open", escalated: true })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .exec();
  }

  async resolveOne(
    reportId: Types.ObjectId | string,
    status: Exclude<ChatReportStatus, "open">,
    resolvedBy: string,
  ): Promise<void> {
    await this.reportModel
      .updateOne(
        { _id: reportId, status: "open" },
        { $set: { status, resolvedBy, resolvedAt: new Date() } },
      )
      .exec();
  }

  async resolveOpenForMessage(
    message: Types.ObjectId | string,
    status: Exclude<ChatReportStatus, "open">,
    resolvedBy: string,
  ): Promise<void> {
    await this.reportModel
      .updateMany(
        { message: new Types.ObjectId(message), status: "open" },
        { $set: { status, resolvedBy, resolvedAt: new Date() } },
      )
      .exec();
  }
}
