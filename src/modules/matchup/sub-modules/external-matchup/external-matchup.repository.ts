import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ExternalTournamentDocument } from "../../../tournament/sub-modules/external-tournament/external-tournament.schema";
import { ExternalMatch } from "./external-matchup-match/external-matchup-match.domain";
import { MatchMapper } from "./external-matchup-match/external-matchup-match.mapper";
import { ExternalMatchup } from "./external-matchup.domain";
import { ExternalMatchupMapper } from "./external-matchup.mapper";
import {
  ExternalMatchupDocument,
  ExternalMatchupEntity,
} from "./external-matchup.schema";

@Injectable()
export class ExternalMatchupRepository {
  constructor(
    @InjectModel(ExternalMatchupEntity.name)
    private readonly externalmatchupModel: Model<ExternalMatchupDocument>,
  ) {}

  async create(externalmatchupData: ExternalMatchupEntity): Promise<void> {
    const externalmatchup = new this.externalmatchupModel(externalmatchupData);
    await externalmatchup.save();
  }

  async findById(id: string | Types.ObjectId): Promise<ExternalMatchup> {
    const matchup = await this.externalmatchupModel
      .findById(id)
      .populate<{ aTeam: { _id: ExternalTournamentDocument } }>("aTeam._id")
      .exec();
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    return ExternalMatchupMapper.fromDatabase(matchup, matchup.aTeam._id);
  }

  async findByTournamentId(
    id: string | Types.ObjectId,
  ): Promise<ExternalMatchup[]> {
    const matchups = await this.externalmatchupModel
      .find({ "aTeam._id": id })
      .populate<{ aTeam: { _id: ExternalTournamentDocument } }>("aTeam._id")
      .exec();
    return matchups.map((matchup) => {
      return ExternalMatchupMapper.fromDatabase(matchup, matchup.aTeam._id);
    });
  }

  async update(
    id: string,
    updateData: Partial<ExternalMatchupEntity>,
  ): Promise<void> {
    await this.externalmatchupModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();
  }

  async updateScore(
    id: string,
    matches: ExternalMatch[],
    aTeamPaste?: string,
    bTeamPaste?: string,
  ): Promise<void> {
    const setData: { [key: string]: unknown } = {
      matches: matches.map(MatchMapper.toDatabasePayload),
    };
    if (aTeamPaste !== undefined) setData["aTeam.paste"] = aTeamPaste;
    if (bTeamPaste !== undefined) setData["bTeam.paste"] = bTeamPaste;

    await this.externalmatchupModel
      .findByIdAndUpdate(id, { $set: setData }, { new: true })
      .exec();
  }
}
