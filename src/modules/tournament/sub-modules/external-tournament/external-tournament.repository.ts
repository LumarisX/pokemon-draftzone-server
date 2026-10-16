import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { ClientSession, Model, Types } from "mongoose";
import { ExternalMatchupMapper } from "../../../matchup/sub-modules/external-matchup/external-matchup.mapper";
import { ExternalMatchupDocument } from "../../../matchup/sub-modules/external-matchup/external-matchup.schema";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentMapper } from "./external-tournament.mapper";
import {
  ExternalTournamentDocument,
  ExternalTournamentEntity,
} from "./external-tournament.schema";

const SLUG_COLLISION_RETRIES = 5;

@Injectable()
export class ExternalTournamentRepository {
  constructor(
    @InjectModel(ExternalTournamentEntity.name)
    private readonly tournamentModel: Model<ExternalTournamentDocument>,
  ) {}

  async findByOwner(owner: string): Promise<ExternalTournament[]> {
    return this.findByOwnerAndState(owner, {
      completedAt: null,
      archivedAt: null,
    });
  }

  async findCompletedByOwner(owner: string): Promise<ExternalTournament[]> {
    return this.findByOwnerAndState(owner, {
      $or: [{ completedAt: { $ne: null } }, { archivedAt: { $ne: null } }],
    });
  }

  private async findByOwnerAndState(
    owner: string,
    stateFilter: Record<string, unknown>,
  ): Promise<ExternalTournament[]> {
    const tournamentDocs = await this.tournamentModel
      .find({ owner: owner, ...stateFilter })
      .populate<{ matchups: ExternalMatchupDocument[] }>("matchups")
      .sort({ createdAt: -1 })
      .exec();

    return tournamentDocs.map((doc) => {
      const matchups = doc.matchups.map((matchup) =>
        ExternalMatchupMapper.fromDatabase(matchup, doc),
      );

      return ExternalTournamentMapper.fromDatabase(doc, matchups);
    });
  }

  async findBySlugAndOwner(
    slug: string,
    owner: string,
  ): Promise<ExternalTournament> {
    const tournamentDoc = await this.tournamentModel
      .findOne({ owner: owner, slug })
      .populate<{ matchups: ExternalMatchupDocument[] }>("matchups")
      .exec();
    if (!tournamentDoc) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
    const matchups = tournamentDoc.matchups.map((matchup) =>
      ExternalMatchupMapper.fromDatabase(matchup, tournamentDoc),
    );
    return ExternalTournamentMapper.fromDatabase(tournamentDoc, matchups);
  }

  async findById(id: string | Types.ObjectId): Promise<ExternalTournament> {
    const tournamentDoc = await this.tournamentModel
      .findById(id)
      .populate<{ matchups: ExternalMatchupDocument[] }>("matchups")
      .exec();
    if (!tournamentDoc) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
    const matchups = tournamentDoc.matchups.map((matchup) =>
      ExternalMatchupMapper.fromDatabase(matchup, tournamentDoc),
    );
    return ExternalTournamentMapper.fromDatabase(tournamentDoc, matchups);
  }

  async create(tournament: ExternalTournament): Promise<void> {
    for (let attempt = 0; attempt < SLUG_COLLISION_RETRIES; attempt++) {
      try {
        await new this.tournamentModel(
          ExternalTournamentMapper.toDatabasePayload(tournament),
        ).save();
        return;
      } catch (error) {
        if (!this.isDuplicateSlugError(error)) throw error;
        tournament.slug = generateSlug();
      }
    }
    throw new PDZError(ErrorCodes.DRAFT.SLUG_GENERATION_FAILED, {
      attempts: SLUG_COLLISION_RETRIES,
    });
  }

  async updateBySlugAndOwner(
    slug: string,
    owner: string,
    tournament: ExternalTournament,
  ): Promise<void> {
    const tournamentDoc = await this.tournamentModel
      .findOneAndUpdate(
        { owner: owner, slug },
        ExternalTournamentMapper.toDatabasePayload(tournament),
        {
          returnDocument: "after",
          upsert: true,
        },
      )
      .exec();
    if (!tournamentDoc) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
  }

  async setCompleted(
    slug: string,
    owner: string,
    completedAt: Date | null,
  ): Promise<void> {
    const update = completedAt
      ? { $set: { completedAt }, $unset: { archivedAt: "" } }
      : { $unset: { completedAt: "", archivedAt: "" } };

    const result = await this.tournamentModel
      .findOneAndUpdate({ owner, slug }, update, { returnDocument: "after" })
      .exec();

    if (!result) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
  }

  private isDuplicateSlugError(error: unknown): boolean {
    return (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000 &&
      error.keyPattern?.slug !== undefined
    );
  }

  async deleteBySlugAndOwner(
    slug: string,
    ownerId: string,
    session?: ClientSession,
  ): Promise<mongoose.DeleteResult> {
    const query = this.tournamentModel.deleteOne({ owner: ownerId, slug });
    if (session) query.session(session);
    return query.exec();
  }
}
