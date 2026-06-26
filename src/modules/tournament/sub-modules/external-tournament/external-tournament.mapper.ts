import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentDto } from "./external-tournament.dto";
import {
  ExternalTournamentDocument,
  ExternalTournamentEntity,
} from "./external-tournament.schema";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";

export class ExternalTournamentMapper {
  static toDatabasePayload(
    tournament: ExternalTournament,
  ): ExternalTournamentEntity {
    return {
      leagueName: tournament.leagueName,
      leagueId: tournament.key,
      teamName: tournament.teamName,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
      owner: tournament.owner,
      doc: tournament.doc,
      team: tournament.team.map(PokemonMapper.toDatabasePayload),
    };
  }

  static toClientPayload(tournament: ExternalTournament) {
    return {
      id: tournament._id?.toString(),
      leagueName: tournament.leagueName,
      tournamentId: tournament.key,
      teamName: tournament.teamName,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
      doc: tournament.doc,
      team: tournament.team.map(PokemonMapper.toClientPayload),
    };
  }

  static fromForm(dto: ExternalTournamentDto, sub: string): ExternalTournament {
    const computedId = dto.leagueName.toLowerCase().trim().replace(/\W/gi, "");
    const ruleset = getRuleset(dto.ruleset);
    const format = getFormat(dto.format);
    const mappedTeam = dto.team
      .filter((pokemon) => pokemon.id)
      .map((pokemon) => PokemonMapper.fromForm(pokemon, ruleset));

    return new ExternalTournament(
      {
        ruleset,
        format,
        leagueName: dto.leagueName.trim(),
        teamName: dto.teamName.trim(),
        key: computedId,
        owner: sub,
        team: mappedTeam,
        doc: dto.doc?.trim(),
      },
      [],
    );
  }

  static fromDatabase(
    tournamentDoc: ExternalTournamentDocument,
    matchups: ExternalMatchup[],
  ): ExternalTournament {
    const ruleset = getRuleset(tournamentDoc.ruleset);
    const format = getFormat(tournamentDoc.format);
    return new ExternalTournament(
      {
        _id: tournamentDoc._id,
        ruleset,
        format,
        leagueName: tournamentDoc.leagueName,
        teamName: tournamentDoc.teamName,
        key: tournamentDoc.leagueId,
        owner: tournamentDoc.owner,
        team: tournamentDoc.team.map((pokemon) =>
          PokemonMapper.fromDatabase(pokemon, ruleset),
        ),
        doc: tournamentDoc.doc,
      },
      matchups,
    );
  }
}
