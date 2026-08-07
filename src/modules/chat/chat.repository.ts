import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  ChatAuthorRole,
  ChatChannel,
  TournamentMessageDocument,
  TournamentMessageEntity,
} from "./chat.schema";

export type ChatRoom = {
  tournament: Types.ObjectId | string;
  channel: ChatChannel;
  target: string;
};

export type CreateChatMessageInput = ChatRoom & {
  author: string;
  authorName: string;
  authorRole: ChatAuthorRole;
  team?: Types.ObjectId | string;
  text: string;
};

@Injectable()
export class ChatRepository {
  constructor(
    @InjectModel(TournamentMessageEntity.name)
    private readonly messageModel: Model<TournamentMessageDocument>,
  ) {}

  async findByRoom(
    room: ChatRoom,
    options?: { limit?: number },
  ): Promise<TournamentMessageDocument[]> {
    const limit = options?.limit ?? 200;
    const messages = await this.messageModel
      .find({ ...room, deletedAt: { $exists: false } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return messages.reverse();
  }

  async findById(
    messageId: Types.ObjectId | string,
  ): Promise<TournamentMessageDocument | null> {
    return this.messageModel.findById(messageId).exec();
  }

  async create(
    input: CreateChatMessageInput,
  ): Promise<TournamentMessageDocument> {
    return this.messageModel.create(input);
  }

  async softDelete(
    messageId: Types.ObjectId | string,
    deletedBy: string,
  ): Promise<void> {
    await this.messageModel
      .updateOne(
        { _id: messageId },
        { $set: { deletedAt: new Date(), deletedBy } },
      )
      .exec();
  }
}
