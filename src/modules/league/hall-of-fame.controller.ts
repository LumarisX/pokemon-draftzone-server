import { Controller, Get, Param } from "@nestjs/common";
import { HallOfFameService } from "./hall-of-fame.service";

@Controller("leagues/:leagueSlug/hall-of-fame")
export class HallOfFameController {
  constructor(private readonly hallOfFame: HallOfFameService) {}

  @Get()
  async getHallOfFame(@Param("leagueSlug") leagueSlug: string) {
    return this.hallOfFame.getHallOfFame(leagueSlug);
  }
}
