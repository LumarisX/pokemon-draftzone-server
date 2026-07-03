import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentDto } from "./external-tournament.dto";
import {
  ExternalTournamentDocument,
  ExternalTournamentEntity,
} from "./external-tournament.schema";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
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
    const unresolved = tournament.unresolvedTeam.map(
      PokemonMapper.toUnresolvedClientPayload,
    );
    return {
      id: tournament._id?.toString(),
      leagueName: tournament.leagueName,
      tournamentId: tournament.key,
      teamName: tournament.teamName,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
      doc: tournament.doc,
      score: tournament.getScore(),
      team: [
        ...tournament.team.map(PokemonMapper.toClientPayload),
        ...unresolved,
      ],
      ...(unresolved.length > 0 && {
        unresolvedPokemon: unresolved.map((pokemon) => pokemon.id),
      }),
    };
  }

  static fromForm(dto: ExternalTournamentDto, sub: string): ExternalTournament {
    const computedId = dto.leagueName
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "");
    if (!computedId) {
      throw new PDZError(ErrorCodes.DRAFT.INVALID_NAME);
    }
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

    // A pokemon that can't be resolved against the stored ruleset (e.g. the
    // wrong ruleset was selected) must not crash mapping for the whole
    // tournament — that would lock the user out of every draft. Collect the
    // failures separately so they can be surfaced as a warning and fixed.
    const { resolved: team, unresolved: unresolvedTeam } =
      PokemonMapper.fromDatabaseTeam(tournamentDoc.team, ruleset);

    return new ExternalTournament(
      {
        _id: tournamentDoc._id,
        ruleset,
        format,
        leagueName: tournamentDoc.leagueName,
        teamName: tournamentDoc.teamName,
        key: tournamentDoc.leagueId,
        owner: tournamentDoc.owner,
        team,
        unresolvedTeam,
        doc: tournamentDoc.doc,
      },
      matchups,
    );
  }
}
