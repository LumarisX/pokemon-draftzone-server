import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Archive, ArchiveV2 } from "./archive.domain";
import { ArchiveMapper } from "./archive.mapper";
import {
  ArchiveDocument,
  ArchiveEntity,
  ArchiveV2Document,
  ArchiveV2Entity,
} from "./archive.schema";

@Injectable()
export class ArchiveRepository {
  constructor(
    @InjectModel(ArchiveEntity.name)
    private readonly archiveModel: Model<ArchiveDocument>,
    @InjectModel(ArchiveV2Entity.name)
    private readonly archiveV2Model: Model<ArchiveV2Document>,
  ) {}

  async findAllByOwner(owner: string): Promise<Archive[]> {
    const docs = await this.archiveModel.find({ owner }).sort({
      createdAt: -1,
    });
    return docs.map((doc) => ArchiveMapper.fromDatabase(doc));
  }

  async findById(teamId: string): Promise<Archive> {
    if (!Types.ObjectId.isValid(teamId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { teamId });

    const doc = await this.archiveModel.findById(teamId);
    if (!doc) throw new PDZError(ErrorCodes.ARCHIVE.NOT_FOUND);
    return ArchiveMapper.fromDatabase(doc);
  }

  async delete(teamId: string): Promise<void> {
    if (!Types.ObjectId.isValid(teamId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { teamId });

    const result = await this.archiveModel.findByIdAndDelete(teamId);
    if (!result) throw new PDZError(ErrorCodes.ARCHIVE.NOT_FOUND);
  }

  async createV2(archive: ArchiveV2): Promise<ArchiveV2> {
    const doc = new this.archiveV2Model(ArchiveMapper.toV2EntityProps(archive));
    await doc.save();
    return ArchiveMapper.fromDatabase(doc) as ArchiveV2;
  }
}
