import {
  HostedTournament,
  TournamentForfeit,
  TournamentRound,
  TournamentRule,
  TournamentStage,
} from "./hosted-tournament.domain";
import { HostedTournamentDocument } from "./hosted-tournament.schema";

export class HostedTournamentMapper {
  static fromDatabase(
    doc: HostedTournamentDocument,
    ownerAuth0Id: string,
  ): HostedTournament {
    return new HostedTournament({
      id: doc._id.toString(),
      name: doc.name,
      tournamentKey: doc.tournamentKey,
      description: doc.description,
      signUpDeadline: doc.signUpDeadline,
      draftStart: doc.draftStart,
      draftEnd: doc.draftEnd,
      seasonStart: doc.seasonStart,
      seasonEnd: doc.seasonEnd,
      owner: ownerAuth0Id,
      leagueId: doc.league.toString(),
      organizers: [...doc.organizers],
      tierListId: doc.tierList?.toString() ?? "",
      rules: doc.rules.map(
        (rule) => new TournamentRule({ title: rule.title, body: rule.body }),
      ),
      logo: doc.logo,
      discord: doc.discord,
      playoffTeamIds: (doc.playoffs?.teams ?? []).map((id) => id.toString()),
      stages: doc.stages.map(
        (stage) =>
          new TournamentStage({
            id: (stage as unknown as { _id: { toString(): string } })._id.toString(),
            name: stage.name,
            type: stage.type,
            rounds: stage.rounds.map(
              (round) =>
                new TournamentRound({
                  id: (round as unknown as { _id: { toString(): string } })._id.toString(),
                  name: round.name,
                  matchDeadline: round.matchDeadline,
                }),
            ),
          }),
      ),
      forfeit: new TournamentForfeit({
        gameDiff: doc.forfeit.gameDiff,
        pokemonDiff: doc.forfeit.pokemonDiff,
      }),
      diffMode: doc.diffMode,
    });
  }

  static toClientPayload(tournament: HostedTournament) {
    return {
      id: tournament.id,
      name: tournament.name,
      tournamentKey: tournament.tournamentKey,
      description: tournament.description,
      signUpDeadline: tournament.signUpDeadline,
      draftStart: tournament.draftStart,
      draftEnd: tournament.draftEnd,
      seasonStart: tournament.seasonStart,
      seasonEnd: tournament.seasonEnd,
      logo: tournament.logo,
      discord: tournament.discord,
      tierListId: tournament.tierListId,
    };
  }
}
