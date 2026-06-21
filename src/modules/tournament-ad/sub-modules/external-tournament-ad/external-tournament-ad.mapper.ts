import { ExternalTournamentAd } from "./external-tournament-ad.domain";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";
import { ExternalTournamentAdEntity } from "./external-tournament-ad.schema";
export class ExternalTournamentAdMapper {
  constructor() {}

  static toDatabasePayload(tournamentAd: ExternalTournamentAd) {
    return {};
  }

  static toClientPayload(tournamentAd: ExternalTournamentAd) {
    return {
      leagueName: tournamentAd.leagueName,
      owner: tournamentAd.owner,
      description: tournamentAd.description,
      leagueDoc: tournamentAd.leagueDoc,
      serverLink: tournamentAd.serverLink,
      skillLevelRange: tournamentAd.skillLevelRange,
      prizeValue: tournamentAd.prizeValue,
      platforms: tournamentAd.platforms,
      formats: tournamentAd.formats,
      rulesets: tournamentAd.rulesets,
      status: tournamentAd.status,
      signupLink: tournamentAd.signupLink,
      closesAt: tournamentAd.closesAt,
      seasonStart: tournamentAd.seasonStart,
      seasonEnd: tournamentAd.seasonEnd,
    };
  }

  static fromForm(
    dto: ExternalTournamentAdDto,
    owner: string,
  ): ExternalTournamentAd {
    return new ExternalTournamentAd({
      leagueName: dto.leagueName,
      owner,
      description: dto.description,
      leagueDoc: dto.leagueDoc,
      serverLink: dto.serverLink,
      skillLevelRange: dto.skillLevelRange,
      prizeValue: dto.prizeValue,
      platforms: dto.platforms,
      formats: dto.formats,
      rulesets: dto.rulesets,
      status: dto.status,
      signupLink: dto.signupLink,
      closesAt: dto.closesAt,
      seasonStart: dto.seasonStart,
      seasonEnd: dto.seasonEnd,
    });
  }

  static fromDatabase(
    entity: ExternalTournamentAdEntity,
  ): ExternalTournamentAd {
    return new ExternalTournamentAd({
      leagueName: entity.leagueName,
      owner: entity.owner,
      description: entity.description,
      leagueDoc: entity.leagueDoc,
      serverLink: entity.serverLink,
      skillLevelRange: entity.skillLevelRange,
      prizeValue: entity.prizeValue,
      platforms: entity.platforms,
      formats: entity.formats,
      rulesets: entity.rulesets,
      status: entity.status,
      signupLink: entity.signupLink,
      closesAt: entity.closesAt,
      seasonStart: entity.seasonStart,
      seasonEnd: entity.seasonEnd,
    });
  }
}
