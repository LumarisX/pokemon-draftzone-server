import { ExternalMatch, TeamMatchStat } from "./external-matchup-match.domain";
import {
  ExternalMatchDto,
  TeamStatDataDto,
} from "./external-matchup-match.dto";
import {
  ExternalMatchEntity,
  ExternalMatchTeamEntity,
} from "./external-matchup-match.schema";

export class MatchMapper {
  static toClientPayload(match: ExternalMatch): ExternalMatchDto {
    return {
      winner: match.winner,
      replay: match.replay,
      aTeam: match.aTeam as TeamStatDataDto,
      bTeam: match.bTeam as TeamStatDataDto | undefined,
    };
  }

  static toDatabasePayload(match: ExternalMatch): ExternalMatchEntity {
    return {
      winner: match.winner,
      replay: match.replay,
      aTeam: this.mapTeamToDatabase(match.aTeam),
      bTeam: match.bTeam
        ? this.mapTeamToDatabase(match.bTeam)
        : { stats: [], score: 0 },
    };
  }

  static fromForm(dto: ExternalMatchDto): ExternalMatch {
    return new ExternalMatch({
      winner: dto.winner,
      replay: dto.replay,
      aTeam: this.mapTeamToDomain(dto.aTeam),
      bTeam: dto.bTeam ? this.mapTeamToDomain(dto.bTeam) : undefined,
    });
  }

  static fromDatabase(entity: ExternalMatchEntity): ExternalMatch {
    return new ExternalMatch({
      winner: entity.winner,
      replay: entity.replay,
      aTeam: this.mapTeamToDomain(entity.aTeam),
      bTeam:
        entity.bTeam.stats.length > 0
          ? this.mapTeamToDomain(entity.bTeam)
          : undefined,
    });
  }

  private static mapTeamToDomain(
    team: TeamStatDataDto | ExternalMatchTeamEntity,
  ): TeamMatchStat {
    return {
      score: team.score,

      stats: team.stats.map(([pokemonId, stats]) => [
        pokemonId,
        {
          brought: stats.brought,
          kills: stats.kills,
          deaths: stats.deaths,
          indirect: stats.indirect,
        },
      ]),
    };
  }

  private static mapTeamToDatabase(
    team: TeamMatchStat,
  ): ExternalMatchTeamEntity {
    return {
      score: team.score,
      stats: team.stats.map(([pokemonId, stats]) => [
        pokemonId,
        {
          brought: stats.brought,
          kills: stats.kills,
          deaths: stats.deaths,
          indirect: stats.indirect,
        },
      ]),
    };
  }
}
