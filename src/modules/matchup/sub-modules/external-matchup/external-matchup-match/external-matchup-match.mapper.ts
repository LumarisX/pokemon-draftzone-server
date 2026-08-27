import {
  ExternalMatch,
  TeamMatchStat,
  normalizePokemonMatchStat,
} from "./external-matchup-match.domain";
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
      aTeam: MatchMapper.mapTeam(match.aTeam),
      bTeam: match.bTeam
        ? MatchMapper.mapTeam(match.bTeam)
        : { stats: [], score: 0 },
    };
  }

  static fromForm(dto: ExternalMatchDto): ExternalMatch {
    return new ExternalMatch({
      winner: dto.winner,
      replay: dto.replay,
      aTeam: MatchMapper.mapTeam(dto.aTeam),
      bTeam: dto.bTeam ? MatchMapper.mapTeam(dto.bTeam) : undefined,
    });
  }

  static fromDatabase(entity: ExternalMatchEntity): ExternalMatch {
    return new ExternalMatch({
      winner: entity.winner,
      replay: entity.replay,
      aTeam: MatchMapper.mapTeam(entity.aTeam),
      bTeam:
        (entity.bTeam?.stats?.length ?? 0) > 0
          ? MatchMapper.mapTeam(entity.bTeam!)
          : undefined,
    });
  }

  private static mapTeam(
    team: TeamStatDataDto | ExternalMatchTeamEntity | TeamMatchStat,
  ): TeamMatchStat {
    return {
      score: team.score ?? 0,
      stats: (team.stats ?? []).map(([pokemonId, stats]) => [
        pokemonId,
        normalizePokemonMatchStat(stats ?? {}),
      ]),
    };
  }
}
