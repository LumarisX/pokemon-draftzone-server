import { StageDocument } from "@modules/stage/stage.schema";
import {
  HostedTournament,
  TournamentForfeit,
  TournamentRule,
} from "./hosted-tournament.domain";
import { HostedTournamentDocument } from "./hosted-tournament.schema";

export class HostedTournamentMapper {
  /**
   * `stages` must already be resolved (and ordered to match `doc.stages`'
   * ObjectId order — that order IS the tournament's stage sequence) by the
   * caller, since `doc.stages` is now a plain `ObjectId[]` and no longer
   * embeds stage data directly.
   */
  static fromDatabase(
    doc: HostedTournamentDocument,
    ownerAuth0Id: string,
    stages: StageDocument[],
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
      stages,
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
