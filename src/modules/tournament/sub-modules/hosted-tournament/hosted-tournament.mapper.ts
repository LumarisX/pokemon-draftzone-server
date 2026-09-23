import { StageDocument } from "@modules/stage/stage.schema";
import { DraftCount } from "@modules/tier-list/tier-list.domain";
import {
  HostedTournament,
  PrizeShare,
  TierRequirement,
  TournamentAdSettings,
  TournamentDiscordSettings,
  TournamentForfeit,
  TournamentMatchSettings,
  TournamentRule,
} from "./hosted-tournament.domain";
import { HostedTournamentDocument } from "./hosted-tournament.schema";

/** The parts of the owning league a tournament needs to carry with it. */
export type TournamentLeague = { owner: string; slug: string; name: string };

export type TournamentTierListMeta = { format: string; ruleset: string } | null;

export class HostedTournamentMapper {
  static fromDatabase(
    doc: HostedTournamentDocument,
    league: TournamentLeague,
    stages: StageDocument[],
    tierListMeta: TournamentTierListMeta = null,
  ): HostedTournament {
    return new HostedTournament({
      id: doc._id.toString(),
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      signUpDeadline: doc.signUpDeadline,
      draftStart: doc.draftStart,
      draftEnd: doc.draftEnd,
      seasonStart: doc.seasonStart,
      seasonEnd: doc.seasonEnd,
      owner: league.owner,
      leagueId: doc.league.toString(),
      leagueSlug: league.slug,
      leagueName: league.name,
      archived: doc.archived,
      organizers: [...doc.organizers],
      organizerNames: (doc.organizerNames ?? []).map(({ sub, name }) => ({
        sub,
        name,
      })),
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
            autoGrantCoachRole: doc.discordSettings.autoGrantCoachRole,
          })
        : undefined,
      stages,
      // Passed through as stored subdocuments rather than remapped: the round
      // `_id`s are what matchups reference, so they have to survive intact.
      rounds: doc.rounds,
      currentRoundIndex: doc.currentRoundIndex,
      trades: doc.trades,
      forfeit: new TournamentForfeit({
        gameDiff: doc.forfeit.gameDiff,
        pokemonDiff: doc.forfeit.pokemonDiff,
      }),
      diffMode: doc.diffMode,
      format: tierListMeta?.format ?? null,
      ruleset: tierListMeta?.ruleset ?? null,
      draftCount: new DraftCount({
        min: doc.draftCount.min,
        max: doc.draftCount.max,
      }),
      pointTotal: doc.pointTotal,
      maxTeams: doc.maxTeams,
      signUpQuestions: doc.signUpQuestions ?? [],
      signUpAccess: doc.signUpAccess ?? "open",
      signUpToken: doc.signUpToken,
      tradePointLimit: doc.tradePointLimit,
      tierRequirements: doc.tierRequirements.map(
        (req) =>
          new TierRequirement({
            tierId: req.tierId.toString(),
            required: req.required,
            max: req.max,
          }),
      ),
      prizeSplit: (doc.prizeSplit ?? []).map(
        (share) =>
          new PrizeShare({ place: share.place, percent: share.percent }),
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
      matchSettings: new TournamentMatchSettings({
        chat: doc.matchSettings?.chat,
        coachReporting: doc.matchSettings?.coachReporting,
      }),
    });
  }

  static toClientPayload(tournament: HostedTournament) {
    return {
      id: tournament.id,
      name: tournament.name,
      tournamentSlug: tournament.slug,
      description: tournament.description,
      signUpDeadline: tournament.signUpDeadline,
      draftStart: tournament.draftStart,
      draftEnd: tournament.draftEnd,
      seasonStart: tournament.seasonStart,
      seasonEnd: tournament.seasonEnd,
      logo: tournament.logo,
      discord: tournament.discord,
      tierListId: tournament.tierListId,
      format: tournament.format?.name ?? null,
      ruleset: tournament.ruleset?.name ?? null,
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
      logo: tournament.logo,
      discord: tournament.discord,
      discordSettings: tournament.discordSettings,
      forfeit: tournament.forfeit,
      diffMode: tournament.diffMode,
      tierListId: tournament.tierListId,
      format: tournament.format?.name ?? null,
      ruleset: tournament.ruleset?.name ?? null,
      draftCount: tournament.draftCount,
      pointTotal: tournament.pointTotal,
      maxTeams: tournament.maxTeams,
      signUpQuestions: tournament.signUpQuestions,
      signUpAccess: tournament.signUpAccess,
      signUpToken: tournament.signUpToken,
      tradePointLimit: tournament.tradePointLimit,
      tierRequirements: tournament.tierRequirements,
      prizeSplit: tournament.prizeSplit,
      adSettings: tournament.adSettings,
      matchSettings: tournament.matchSettings,
      archived: tournament.archived,
    };
  }
}
