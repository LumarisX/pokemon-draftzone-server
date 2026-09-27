import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import {
  Controller,
  MessageEvent,
  Param,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { DraftStreamService } from "./draft-stream.service";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/draft-events")
export class DraftStreamController {
  constructor(
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly draftStream: DraftStreamService,
  ) {}

  @Sse()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async events(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    return this.draftStream.streamFor(tournament, sub ?? null);
  }
}
