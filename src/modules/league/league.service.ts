import { CoachRepository } from "@modules/coach/coach.repository";
import { getName } from "@modules/data/domain/pokedex";
import { DraftRepository } from "@modules/draft/draft.repository";
import { getRosterByRound } from "@modules/stage/domain/roster";
import { TeamRepository } from "@modules/team/team.repository";
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
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
    private readonly draftRepo: DraftRepository,
  ) {}

  async getLeagues(sub: string) {
    const [tournaments, coaches] = await Promise.all([
      this.hostedTournamentRepo.findByParticipant(sub),
      this.coachRepo.findByAuth0Id(sub),
    ]);
    if (tournaments.length === 0) return { tournaments: [] };

    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    const teamsByTournament = new Map(
      teams.map((team) => [team.tournamentId.toString(), team]),
    );

    const drafts = await this.draftRepo.findManyByIds(
      teams.flatMap((team) => (team.draftId ? [team.draftId] : [])),
    );
    const draftKeysById = new Map(
      drafts.map((draft) => [draft._id.toString(), draft.draftKey]),
    );

    const details = await Promise.all(
      tournaments.map(async (tournament) => {
        const team = teamsByTournament.get(tournament.id);
        if (!team) return null;
        const [league, tierList] = await Promise.all([
          this.leagueRepo.findById(tournament.leagueId),
          this.tierListRepo.findById(tournament.tierListId),
        ]);
        const roster = getRosterByRound(team, undefined).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          draftFormes: tierList.getPokemonFormes(pokemon.id),
        }));
        return {
          name: tournament.name,
          teamName: team.teamName,
          tournamentName: tournament.name,
          logo: team.logo ?? tournament.logo,
          discord: tournament.discord,
          tournamentKey: tournament.tournamentKey,
          leagueName: league.name,
          leagueKey: league.leagueKey,
          draftKey: team.draftId
            ? draftKeysById.get(team.draftId.toString())
            : undefined,
          teamId: team._id.toString(),
          draft: roster,
          format: tournament.format.name,
          ruleset: tournament.ruleset.name,
        };
      }),
    );

    return {
      tournaments: details.filter(
        (detail): detail is NonNullable<typeof detail> => detail !== null,
      ),
    };
  }

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
