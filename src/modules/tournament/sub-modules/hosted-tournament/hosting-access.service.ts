import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueRepository } from "@modules/league/league.repository";
import { UserService } from "@modules/user/user.service";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  decideTournamentCreation,
  maxActiveTournaments,
  mayHost,
  TournamentCreationDecision,
  tournamentCreationMode,
} from "./tournament-creation.policy";

export type HostingAccess = {
  canHost: boolean;
  tournament: TournamentCreationDecision;
};

@Injectable()
export class HostingAccessService {
  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
    private readonly leagueRepo: LeagueRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
  ) {}

  async canHost(sub: string): Promise<boolean> {
    const user = await this.userService.getMe(sub);
    return mayHost(this.mode(), user.roles ?? []);
  }

  async access(sub: string): Promise<HostingAccess> {
    const [user, leagues] = await Promise.all([
      this.userService.getMe(sub),
      this.leagueRepo.findByOwner(sub),
    ]);
    const activeCount = await this.tournamentRepo.countActiveInLeagues(
      leagues.map((league) => league._id),
    );
    const mode = this.mode();
    const roles = user.roles ?? [];
    return {
      canHost: mayHost(mode, roles),
      tournament: decideTournamentCreation({
        mode,
        roles,
        activeCount,
        maxActive: maxActiveTournaments(
          this.config.get<string>("MAX_ACTIVE_TOURNAMENTS"),
        ),
      }),
    };
  }

  async assertCanCreateLeague(sub: string): Promise<void> {
    if (!(await this.canHost(sub)))
      throw new PDZError(ErrorCodes.LEAGUE.CREATION_RESTRICTED);
  }

  async assertCanCreateTournament(sub: string): Promise<void> {
    const { tournament } = await this.access(sub);
    if (!tournament.allowed)
      throw new PDZError(
        tournament.reason === "limit"
          ? ErrorCodes.TOURNAMENT.ACTIVE_LIMIT
          : ErrorCodes.TOURNAMENT.CREATION_RESTRICTED,
      );
  }

  private mode() {
    return tournamentCreationMode(this.config.get<string>("TOURNAMENT_CREATION"));
  }
}
