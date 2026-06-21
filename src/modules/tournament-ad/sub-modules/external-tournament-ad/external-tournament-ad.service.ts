import { Injectable } from "@nestjs/common";
import { ExternalTournamentAdRepository } from "./external-tournament-ad.repository";

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

  //TODO: Build this service call
  async createExternalTournamentAd() {}

  //TODO: Build this service call
  async deleteExternalTournamentAd() {}
}
