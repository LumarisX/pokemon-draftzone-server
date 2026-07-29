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

/** Five re-rolls against a 2.18e14 keyspace; exhausting them means a defect. */
const SLUG_COLLISION_RETRIES = 5;

@Injectable()
export class ExternalTournamentRepository {
  constructor(
    @InjectModel(ExternalTournamentEntity.name)
    private readonly tournamentModel: Model<ExternalTournamentDocument>,
  ) {}

  async findByOwner(owner: string): Promise<ExternalTournament[]> {
    const tournamentDocs = await this.tournamentModel
      .find({ owner: owner })
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
    // Slugs are random base62(8), so a collision here is chance (~1 in 2.18e14
    // per insert), not user error — re-roll and retry rather than failing the
    // request. The unique index is what makes this safe under concurrency:
    // two simultaneous inserts can't both win.
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
    // Exhausting the retries means something is wrong with the generator or
    // the index, not that the user picked a taken name.
    throw new PDZError(ErrorCodes.DRAFT.SLUG_GENERATION_FAILED, {
      attempts: SLUG_COLLISION_RETRIES,
    });
  }

  async updateBySlugAndOwner(
    slug: string,
    owner: string,
    tournament: ExternalTournament,
  ): Promise<void> {
    let tournamentDoc;
    try {
      tournamentDoc = await this.tournamentModel
        .findOneAndUpdate(
          { owner: owner, slug },
          ExternalTournamentMapper.toDatabasePayload(tournament),
          {
            returnDocument: "after",
            upsert: true,
          },
        )
        .exec();
    } catch (error) {
      // No duplicate-slug branch here: the filter and the upserted document
      // carry the same owner+slug, so anything the unique index would reject
      // is something the filter would already have matched and updated.
      throw error;
    }
    if (!tournamentDoc) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
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
