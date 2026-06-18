import { getRuleset } from "@core/data/rulesets/rulesets";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { ClientSession, Model, Types } from "mongoose";
import { ErrorCodes } from "../../../../errors/error-codes";
import { ExternalMatchupMapper } from "./external-matchup/external-matchup.mapper";
import { ExternalMatchupDocument } from "./external-matchup/external-matchup.schema";
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
      const ruleset = getRuleset(doc.ruleset);
      const matchups = doc.matchups.map((matchup) =>
        ExternalMatchupMapper.fromDatabase(matchup, ruleset),
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
    if (!tournamentDoc) throw new NotFoundException(ErrorCodes.DRAFT.NOT_FOUND);
    const ruleset = getRuleset(tournamentDoc.ruleset);
    const matchups = tournamentDoc.matchups.map((matchup) =>
      ExternalMatchupMapper.fromDatabase(matchup, ruleset),
    );
    return ExternalTournamentMapper.fromDatabase(tournamentDoc, matchups);
  }

  async findById(id: string | Types.ObjectId): Promise<ExternalTournament> {
    const tournamentDoc = await this.tournamentModel
      .findById(id)
      .populate<{ matchups: ExternalMatchupDocument[] }>("matchups")
      .exec();
    if (!tournamentDoc) throw new NotFoundException(ErrorCodes.DRAFT.NOT_FOUND);
    const ruleset = getRuleset(tournamentDoc.ruleset);
    const matchups = tournamentDoc.matchups.map((matchup) =>
      ExternalMatchupMapper.fromDatabase(matchup, ruleset),
    );
    return ExternalTournamentMapper.fromDatabase(tournamentDoc, matchups);
  }

  async create(tournament: ExternalTournament): Promise<void> {
    const tournamentDoc = new this.tournamentModel(
      ExternalTournamentMapper.toDatabasePayload(tournament),
    );
    await tournamentDoc.save();
  }

  async updateByKeyAndOwner(
    key: string,
    owner: string,
    tournament: ExternalTournament,
  ): Promise<void> {
    const tournamentDoc = await this.tournamentModel
      .findOneAndUpdate(
        { owner: owner, leagueId: key },
        ExternalTournamentMapper.toDatabasePayload(tournament),
        {
          new: true,
          upsert: true,
        },
      )
      .exec();
    if (!tournamentDoc) throw new NotFoundException(ErrorCodes.DRAFT.NOT_FOUND);
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
