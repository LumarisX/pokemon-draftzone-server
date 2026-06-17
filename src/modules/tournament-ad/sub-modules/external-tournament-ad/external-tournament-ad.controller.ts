import { Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { ExternalTournamentAdService } from "./external-tournament-ad.service";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";

@Controller("tournament-ads/external")
export class ExternalTournamentAdController {
  constructor(
    private readonly externalTournamentAdService: ExternalTournamentAdService,
  ) {}

  @Get()
  async getExternalTournamentAds() {
    return await this.externalTournamentAdService.getExternalTournamentAds();
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getExternalTournamentAdsManage() {
    return await this.externalTournamentAdService.getMyExternalTournamentAds();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createExternalTournamentAdsManage() {
    return await this.externalTournamentAdService.createExternalTournamentAd();
  }

  @Delete(":adId")
  @UseGuards(JwtAuthGuard)
  async deleteExternalTournamentAd() {
    return await this.externalTournamentAdService.deleteExternalTournamentAd();
  }
}
