import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { DraftSpecie } from "../../../../classes/pokemon";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentDto } from "./external-tournament.dto";
import {
  ExternalTournamentDocument,
  ExternalTournamentEntity,
} from "./external-tournament.schema";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";

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
      team: tournament.team.map((pokemon) => pokemon.toData()),
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
      team: tournament.team.map((pokemon) => pokemon.toClient()),
    };
  }

  static fromForm(dto: ExternalTournamentDto, sub: string): ExternalTournament {
    const computedId = dto.leagueName.toLowerCase().trim().replace(/\W/gi, "");
    const ruleset = getRuleset(dto.ruleset);
    const format = getFormat(dto.format);
    const mappedTeam = dto.team
      .filter((poke) => poke.id)
      .map((poke) => new DraftSpecie(poke, ruleset));

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
        team: DraftSpecie.getTeam(tournamentDoc.team, ruleset),
        doc: tournamentDoc.doc,
      },
      matchups,
    );
  }
}
