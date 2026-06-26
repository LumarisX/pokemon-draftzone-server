import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { ExternalMatchupRepository } from "../external-matchup.repository";

@Injectable()
export class ExternalMatchupBreakdownService {
  constructor(private readonly matchupRepo: ExternalMatchupRepository) {}

  async getMatchupById(matchupId: Types.ObjectId) {
    const matchup = await this.matchupRepo.findById(matchupId);
    return matchup;
  }
}
