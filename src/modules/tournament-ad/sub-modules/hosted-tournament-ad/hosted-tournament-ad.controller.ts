import { Controller, Get } from "@nestjs/common";
import { HostedTournamentAdService } from "./hosted-tournament-ad.service";

@Controller("hosted/tournament-ads")
export class HostedTournamentAdController {
  constructor(
    private readonly hostedTournamentAdService: HostedTournamentAdService,
  ) {}

  @Get()
  async getHostedTournamentAds() {
    return this.hostedTournamentAdService.getHostedTournamentAds();
  }
}
