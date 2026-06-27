import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable } from "@nestjs/common";
import { LeagueRepository } from "./league.repository";

@Injectable()
export class LeagueService {
  constructor(
    private readonly leagueRepo: LeagueRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
  ) {}

  async getLeagueSummary(leagueKey: string) {
    const league = await this.leagueRepo.findByKey(leagueKey);
    const tournaments = await this.hostedTournamentRepo.findAllByLeague(
      league._id.toString(),
      league.owner,
    );

    const tournamentSummaries = await Promise.all(
      tournaments.map(async (tournament) => {
        const tierList = await this.tierListRepo.findById(
          tournament.tierListId,
        );
        return {
          name: tournament.name,
          tournamentKey: tournament.tournamentKey,
          description: tournament.description,
          format: tierList.format.name,
          ruleset: tierList.ruleset.name,
          signUpDeadline: tournament.signUpDeadline,
          draftStart: tournament.draftStart,
          draftEnd: tournament.draftEnd,
          seasonStart: tournament.seasonStart,
          seasonEnd: tournament.seasonEnd,
          logo: tournament.logo,
          discord: tournament.discord,
        };
      }),
    );

    return {
      name: league.name,
      leagueKey: league.leagueKey,
      description: league.description,
      logo: league.logo,
      tournaments: tournamentSummaries,
    };
  }
}
