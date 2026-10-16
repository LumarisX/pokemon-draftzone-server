import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
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
      slug: tournament.slug,
      teamName: tournament.teamName,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
      owner: tournament.owner,
      doc: tournament.doc,
      coach: tournament.coach,
      team: tournament.team.map(PokemonMapper.toDatabasePayload),
    };
  }

  private static nextScheduled(tournament: ExternalTournament): string | null {
    const now = Date.now();
    const upcoming = (tournament.matchups ?? [])
      .filter(
        (matchup) =>
          matchup.scheduledDate &&
          matchup.scheduledDate.getTime() > now &&
          !matchup.calculateScore(),
      )
      .sort((a, b) => a.scheduledDate!.getTime() - b.scheduledDate!.getTime());

    return upcoming[0]?.scheduledDate?.toISOString() ?? null;
  }

  static toClientPayload(tournament: ExternalTournament) {
    const unresolved = tournament.unresolvedTeam.map(
      PokemonMapper.toUnresolvedClientPayload,
    );
    return {
      id: tournament._id?.toString(),
      leagueName: tournament.leagueName,
      slug: tournament.slug,
      teamName: tournament.teamName,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
      doc: tournament.doc,
      coach: tournament.coach,
      completedAt: tournament.completedAt ?? null,
      score: tournament.getScore(),
      form: tournament.getForm(),
      next: tournament.completedAt ? null : tournament.getNextMatch(),
      nextMatch: ExternalTournamentMapper.nextScheduled(tournament),
      team: [
        ...tournament.team.map(PokemonMapper.toClientPayload),
        ...unresolved,
      ],
      ...(unresolved.length > 0 && {
        unresolvedPokemon: unresolved.map((pokemon) => pokemon.id),
      }),
    };
  }

  static toArchiveListItem(tournament: ExternalTournament) {
    return {
      _id: tournament._id?.toString(),
      leagueName: tournament.leagueName,
      teamName: tournament.teamName,
      owner: tournament.owner,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
      slug: tournament.slug,
      team: tournament.team.map(PokemonMapper.toClientPayload),
      score: tournament.getScore(),
      completedAt: tournament.completedAt ?? null,
    };
  }

  static fromForm(
    dto: ExternalTournamentDto,
    sub: string,
    slug?: string,
  ): ExternalTournament {
    const leagueName = dto.leagueName.trim();
    if (!leagueName) {
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
        leagueName,
        teamName: dto.teamName.trim(),
        slug: slug ?? generateSlug(),
        owner: sub,
        team: mappedTeam,
        doc: dto.doc?.trim(),
        coach: dto.coach?.trim() || undefined,
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

    const { resolved: team, unresolved: unresolvedTeam } =
      PokemonMapper.fromDatabaseTeam(tournamentDoc.team, ruleset);

    return new ExternalTournament(
      {
        _id: tournamentDoc._id,
        ruleset,
        format,
        leagueName: tournamentDoc.leagueName,
        teamName: tournamentDoc.teamName,
        slug: tournamentDoc.slug,
        owner: tournamentDoc.owner,
        team,
        unresolvedTeam,
        doc: tournamentDoc.doc,
        coach: tournamentDoc.coach,
        completedAt: tournamentDoc.completedAt ?? tournamentDoc.archivedAt,
      },
      matchups,
    );
  }
}
