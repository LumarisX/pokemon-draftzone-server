import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
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

  async findByKeyAndOwner(
    key: string,
    owner: string,
  ): Promise<ExternalTournament> {
    const tournamentDoc = await this.tournamentModel
      .findOne({ owner: owner, leagueId: key })
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
    const tournamentDoc = new this.tournamentModel(
      ExternalTournamentMapper.toDatabasePayload(tournament),
    );
    try {
      await tournamentDoc.save();
    } catch (error) {
      if (this.isDuplicateLeagueIdError(error))
        throw new PDZError(ErrorCodes.DRAFT.DUPLICATE_NAME, {
          leagueName: tournament.leagueName,
        });
      throw error;
    }
  }

  async updateByKeyAndOwner(
    key: string,
    owner: string,
    tournament: ExternalTournament,
  ): Promise<void> {
    let tournamentDoc;
    try {
      tournamentDoc = await this.tournamentModel
        .findOneAndUpdate(
          { owner: owner, leagueId: key },
          ExternalTournamentMapper.toDatabasePayload(tournament),
          {
            new: true,
            upsert: true,
          },
        )
        .exec();
    } catch (error) {
      if (this.isDuplicateLeagueIdError(error)) {
        throw new PDZError(ErrorCodes.DRAFT.DUPLICATE_NAME, {
          leagueName: tournament.leagueName,
        });
      }
      throw error;
    }
    if (!tournamentDoc) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
  }

  private isDuplicateLeagueIdError(error: unknown): boolean {
    return (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000 &&
      error.keyPattern?.leagueId !== undefined
    );
  }

  async deleteByKeyAndOwner(
    leagueId: string,
    ownerId: string,
    session?: ClientSession,
  ): Promise<mongoose.DeleteResult> {
    const query = this.tournamentModel.deleteOne({ owner: ownerId, leagueId });
    if (session) query.session(session);
    return query.exec();
  }
}
