import { StageDocument } from "@modules/stage/stage.schema";
import { DraftCount } from "@modules/tier-list/tier-list.domain";
import {
  HostedTournament,
  TierRequirement,
  TournamentAdSettings,
  TournamentDiscordSettings,
  TournamentForfeit,
  TournamentRule,
} from "./hosted-tournament.domain";
import { HostedTournamentDocument } from "./hosted-tournament.schema";

export class HostedTournamentMapper {
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
      discordSettings: doc.discordSettings
        ? new TournamentDiscordSettings({
            guildId: doc.discordSettings.guildId,
            coachRoleId: doc.discordSettings.coachRoleId,
            signUpChannelId: doc.discordSettings.signUpChannelId,
          })
        : undefined,
      stages,
      forfeit: new TournamentForfeit({
        gameDiff: doc.forfeit.gameDiff,
        pokemonDiff: doc.forfeit.pokemonDiff,
      }),
      diffMode: doc.diffMode,
      format: doc.format,
      ruleset: doc.ruleset,
      draftCount: new DraftCount({
        min: doc.draftCount.min,
        max: doc.draftCount.max,
      }),
      pointTotal: doc.pointTotal,
      tierRequirements: doc.tierRequirements.map(
        (req) =>
          new TierRequirement({
            tierName: req.tierName,
            required: req.required,
          }),
      ),
      adSettings: doc.adSettings
        ? new TournamentAdSettings({
            advertise: doc.adSettings.advertise,
            skillLevelRange: doc.adSettings.skillLevelRange
              ? {
                  from: doc.adSettings.skillLevelRange.from,
                  to: doc.adSettings.skillLevelRange.to,
                }
              : undefined,
            prizeValue: doc.adSettings.prizeValue,
            platforms: [...doc.adSettings.platforms],
          })
        : undefined,
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
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
    };
  }

  static toSettingsPayload(tournament: HostedTournament) {
    return {
      name: tournament.name,
      description: tournament.description,
      signUpDeadline: tournament.signUpDeadline,
      draftStart: tournament.draftStart,
      draftEnd: tournament.draftEnd,
      seasonStart: tournament.seasonStart,
      seasonEnd: tournament.seasonEnd,
      discord: tournament.discord,
      discordSettings: tournament.discordSettings,
      forfeit: tournament.forfeit,
      diffMode: tournament.diffMode,
      tierListId: tournament.tierListId,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
      draftCount: tournament.draftCount,
      pointTotal: tournament.pointTotal,
      tierRequirements: tournament.tierRequirements,
      adSettings: tournament.adSettings,
    };
  }
}
