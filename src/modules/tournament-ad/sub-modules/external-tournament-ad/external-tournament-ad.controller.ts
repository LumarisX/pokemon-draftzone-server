import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ExternalTournamentAdService } from "./external-tournament-ad.service";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { User } from "@core/decorators/user.decorator";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";

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
    const tournamentAds =
      await this.externalTournamentAdService.getMyExternalTournamentAds(sub);
    return tournamentAds.map(ExternalTournamentAdMapper.toClientPayload);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createExternalTournamentAdsManage(
    @Body() dto: ExternalTournamentAdDto,
    @User() sub: string,
  ) {
    const tournamentAd =
      await this.externalTournamentAdService.createExternalTournamentAd(
        dto,
        sub,
      );
    return ExternalTournamentAdMapper.toClientPayload(tournamentAd);
  }

  @Delete(":adId")
  @UseGuards(JwtAuthGuard)
  async deleteExternalTournamentAd(
    @Param("adId") adId: string,
    @User() sub: string,
  ) {
    await this.externalTournamentAdService.deleteExternalTournamentAd(
      adId,
      sub,
    );
    return { message: "Advertisement deleted." };
  }
}
