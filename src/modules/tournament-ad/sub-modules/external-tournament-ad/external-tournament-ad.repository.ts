import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  ExternalTournamentAdDocument,
  ExternalTournamentAdEntity,
} from "./external-tournament-ad.schema";
@Injectable()
export class ExternalTournamentAdRepository {
  constructor(
    @InjectModel(ExternalTournamentAdEntity.name)
    private readonly externalTournamentAdModel: Model<ExternalTournamentAdDocument>,
  ) {}
}
