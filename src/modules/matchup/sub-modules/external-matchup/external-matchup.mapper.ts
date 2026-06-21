import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { DraftPokemonMapper } from "@modules/draft-pokemon/draft-pokemon.mapper";
import { ExternalTournamentDocument } from "../../../tournament/sub-modules/external-tournament/external-tournament.schema";
import { MatchMapper } from "./external-matchup-match/external-matchup-match.mapper";
import { ExternalMatchup } from "./external-matchup.domain";
import { ExternalMatchupDto } from "./external-matchup.dto";
import {
  ExternalMatchupDocument,
  ExternalMatchupEntity,
} from "./external-matchup.schema";

export class ExternalMatchupMapper {
  static toClientPayload(matchup: ExternalMatchup) {
    return {
      _id: matchup.bTeam.id,
      stage: matchup.stage,
      teamName: matchup.bTeam.teamName,
      coach: matchup.bTeam.coach,
      team: matchup.bTeam.team.map(DraftPokemonMapper.toClientPayload),
      score: matchup.calculateScore(),
      matches: matchup.matches,
      paste: matchup.bTeam.paste,
    };
  }

  static toDatabasePayload(matchup: ExternalMatchup): ExternalMatchupEntity {
    return {
      aTeam: {
        _id: matchup.aTeam.id!,
        paste: matchup.aTeam.paste,
      },
      bTeam: {
        teamName: matchup.bTeam.teamName,
        coach: matchup.bTeam.coach ?? undefined,
        team: matchup.bTeam.team.map(DraftPokemonMapper.toDatabasePayload),
        paste: matchup.bTeam.paste,
      },
      stage: matchup.stage ?? "",
      matches: matchup.matches.map((match) =>
        MatchMapper.toDatabasePayload(match),
      ),
    };
  }

  static fromForm(
    data: ExternalMatchupDto,
    existing: ExternalMatchup,
  ): ExternalMatchup {
    return new ExternalMatchup({
      ruleset: existing.ruleset,
      format: existing.format,
      tournamentName: existing.tournamentName,
      stage: data.stage ?? existing.stage,
      matches: data.matches
        ? data.matches.map((m) => MatchMapper.fromForm(m))
        : existing.matches,
      aTeam: existing.aTeam,
      bTeam: {
        id: existing.bTeam.id,
        team: data.team
          .filter((pokemonData) => pokemonData.id)
          .map((pokemonData) =>
            DraftPokemonMapper.fromForm(pokemonData, existing.ruleset),
          ),
        teamName: data.teamName,
        coach: data.coach,
        paste: existing.bTeam.paste,
      },
    });
  }

  static fromDatabase(
    matchupDoc: ExternalMatchupDocument,
    tournamentDoc: ExternalTournamentDocument,
  ): ExternalMatchup {
    const ruleset = getRuleset(tournamentDoc.ruleset);
    const format = getFormat(tournamentDoc.format);
    return new ExternalMatchup({
      ruleset,
      format,
      tournamentName: tournamentDoc.leagueName,
      stage: matchupDoc.stage,
      matches: matchupDoc.matches
        ? matchupDoc.matches.map((m) => MatchMapper.fromDatabase(m))
        : [],
      aTeam: {
        id: tournamentDoc._id,
        team: tournamentDoc.team.map((pokemon) =>
          DraftPokemonMapper.fromDatabase(pokemon, ruleset),
        ),
        teamName: tournamentDoc.teamName,
        owner: tournamentDoc.owner,
        paste: matchupDoc.aTeam?.paste,
        notes: matchupDoc.notes,
      },
      bTeam: {
        id: matchupDoc._id,
        team: matchupDoc.bTeam.team.map((pokemon) =>
          DraftPokemonMapper.fromDatabase(pokemon, ruleset),
        ),
        teamName: matchupDoc.bTeam.teamName,
        coach: matchupDoc.bTeam.coach,
        paste: matchupDoc.bTeam.paste,
      },
    });
  }
}
