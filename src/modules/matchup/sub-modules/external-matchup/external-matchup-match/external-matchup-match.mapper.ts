import {
  ExternalMatch,
  MatchKo,
  MatchPokemonRef,
  TeamMatchStat,
  normalizePokemonMatchStat,
} from "./external-matchup-match.domain";
import {
  ExternalMatchDto,
  MatchKoDto,
  TeamStatDataDto,
} from "./external-matchup-match.dto";
import {
  ExternalMatchEntity,
  ExternalMatchKoEntity,
  ExternalMatchTeamEntity,
} from "./external-matchup-match.schema";

export class MatchMapper {
  static toClientPayload(match: ExternalMatch): ExternalMatchDto {
    return {
      winner: match.winner,
      replay: match.replay,
      aTeam: match.aTeam as TeamStatDataDto,
      bTeam: match.bTeam as TeamStatDataDto | undefined,
      kos: match.kos ? MatchMapper.mapKos(match.kos) : undefined,
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
      kos: match.kos ? MatchMapper.mapKos(match.kos) : undefined,
    };
  }

  static fromForm(dto: ExternalMatchDto): ExternalMatch {
    return new ExternalMatch({
      winner: dto.winner,
      replay: dto.replay,
      aTeam: MatchMapper.mapTeam(dto.aTeam),
      bTeam: dto.bTeam ? MatchMapper.mapTeam(dto.bTeam) : undefined,
      kos: dto.kos ? MatchMapper.mapKos(dto.kos) : undefined,
    }).withKoCounts();
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
      kos: entity.kos ? MatchMapper.mapKos(entity.kos) : undefined,
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

  private static mapKos(
    kos: readonly (MatchKo | MatchKoDto | ExternalMatchKoEntity)[],
  ): MatchKo[] {
    return kos.map((ko) => {
      const mapped: MatchKo = {
        victim: MatchMapper.mapRef(ko.victim),
        indirect: !!ko.indirect,
      };
      if (ko.attacker) mapped.attacker = MatchMapper.mapRef(ko.attacker);
      const note = ko.note?.trim();
      if (note) mapped.note = note;
      return mapped;
    });
  }

  private static mapRef(ref: MatchPokemonRef): MatchPokemonRef {
    return { team: ref.team, pokemon: ref.pokemon };
  }
}
