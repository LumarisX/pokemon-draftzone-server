import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ErrorCodes } from "../../../../../errors/error-codes";
import { PDZError } from "../../../../../errors/pdz-error";
import { ExternalMatchupDto } from "./external-matchup.dto";
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

  async create(
    externalmatchupData: ExternalMatchupDto,
  ): Promise<ExternalMatchupDocument> {
    const externalmatchup = new this.externalmatchupModel(externalmatchupData);
    return externalmatchup.save();
  }

  async findById(id: string): Promise<ExternalMatchupDocument> {
    const externalmatchup = await this.externalmatchupModel.findById(id).exec();
    if (!externalmatchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    return externalmatchup;
  }

  async findByTournamentId(
    tournamentId: Types.ObjectId,
  ): Promise<ExternalMatchupDocument[]> {
    return this.externalmatchupModel
      .find({ "aTeam._id": new Types.ObjectId(tournamentId) })
      .exec();
  }
  async update(
    id: string,
    updateData: Partial<ExternalMatchupDto>,
  ): Promise<ExternalMatchupDocument | null> {
    return this.externalmatchupModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();
  }

  async updateScore(
    id: string,
    matches: ExternalMatchupDto["matches"],
    aTeamPaste?: string,
    bTeamPaste?: string,
  ): Promise<ExternalMatchupDocument | null> {
    const setData: { [key: string]: unknown } = { matches };
    if (aTeamPaste !== undefined) setData["aTeam.paste"] = aTeamPaste;
    if (bTeamPaste !== undefined) setData["bTeam.paste"] = bTeamPaste;

    return this.externalmatchupModel
      .findByIdAndUpdate(id, { $set: setData }, { new: true })
      .exec();
  }
}
