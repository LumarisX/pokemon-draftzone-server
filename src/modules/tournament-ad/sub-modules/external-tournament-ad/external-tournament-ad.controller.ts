import { Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { ExternalTournamentAdService } from "./external-tournament-ad.service";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { User } from "@core/decorators/user.decorator";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";

@Controller("external/tournament-ads")
export class ExternalTournamentAdController {
  constructor(
    private readonly externalTournamentAdService: ExternalTournamentAdService,
  ) {}

  @Get()
  async getExternalTournamentAds() {
    const tournamentAds =
      await this.externalTournamentAdService.getExternalTournamentAds();
    return tournamentAds.map(ExternalTournamentAdMapper.toClientPayload);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getExternalTournamentAdsManage(@User() sub: string) {
    return await this.externalTournamentAdService.getMyExternalTournamentAds(
      sub,
    );
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
