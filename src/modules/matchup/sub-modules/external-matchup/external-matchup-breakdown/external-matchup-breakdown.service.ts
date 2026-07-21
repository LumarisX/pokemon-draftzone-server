import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { UserService } from "@modules/user/user.service";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { ExternalMatchup } from "../external-matchup.domain";
import { ExternalMatchupRepository } from "../external-matchup.repository";

@Injectable()
export class ExternalMatchupBreakdownService {
  constructor(
    private readonly matchupRepo: ExternalMatchupRepository,
    private readonly userService: UserService,
  ) {}

  async getMatchupById(matchupId: Types.ObjectId) {
    const matchup = await this.matchupRepo.findById(matchupId);
    await this.resolveOwnerCoaches(matchup);
    return matchup;
  }

  private async resolveOwnerCoaches(matchup: ExternalMatchup): Promise<void> {
    await Promise.all(
      [matchup.aTeam, matchup.bTeam].map(async (side) => {
        if (side.coach || !side.owner) return;
        side.coach = await this.userService.getUsername(side.owner);
      }),
    );
  }

  async isOwner(matchupId: Types.ObjectId, sub: string): Promise<boolean> {
    const matchup = await this.matchupRepo.findById(matchupId);
    return matchup.aTeam.owner === sub;
  }

  async updateNotes(
    matchupId: Types.ObjectId,
    sub: string,
    notes: string,
  ): Promise<void> {
    const matchup = await this.matchupRepo.findById(matchupId);
    if (matchup.aTeam.owner !== sub) {
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    }
    await this.matchupRepo.update(matchupId.toString(), { notes });
  }
}
