import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { ExternalTournamentAdRepository } from "./external-tournament-ad.repository";
import { ExternalTournamentAd } from "./external-tournament-ad.domain";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";

@Injectable()
export class ExternalTournamentAdService {
  constructor(
    private readonly tournamentAdRepo: ExternalTournamentAdRepository,
  ) {}

  async getExternalTournamentAds() {
    const tournamentAds = await this.tournamentAdRepo.getOpenTournamentAds();
    return tournamentAds;
  }

  async getMyExternalTournamentAds(owner: string) {
    const tournamentAds = await this.tournamentAdRepo.getMyTournamentAds(owner);
    return tournamentAds;
  }

  async createExternalTournamentAd(
    dto: ExternalTournamentAdDto,
    owner: string,
  ): Promise<ExternalTournamentAd> {
    const tournamentAd = ExternalTournamentAdMapper.fromForm(dto, owner);
    return this.tournamentAdRepo.createTournamentAd(tournamentAd);
  }

  async deleteExternalTournamentAd(adId: string, owner: string): Promise<void> {
    if (!Types.ObjectId.isValid(adId))
      throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND);
    const deletedCount = await this.tournamentAdRepo.deleteTournamentAd(
      adId,
      owner,
    );
    if (deletedCount === 0) throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND);
  }
}
