import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { TournamentScore } from "@modules/tournament/sub-modules/external-tournament/external-tournament.domain";
import { ExternalTournamentRepository } from "@modules/tournament/sub-modules/external-tournament/external-tournament.repository";
import { Injectable } from "@nestjs/common";
import { MatchMapper } from "./external-matchup-match/external-matchup-match.mapper";
import { ExternalMatchup } from "./external-matchup.domain";
import {
  ExternalMatchupDto,
  SchedulePatchDto,
  ScorePatchDto,
} from "./external-matchup.dto";
import { ExternalMatchupMapper } from "./external-matchup.mapper";
import { ExternalMatchupRepository } from "./external-matchup.repository";

@Injectable()
export class ExternalMatchupService {
  constructor(
    private readonly matchupRepo: ExternalMatchupRepository,
    private readonly tournamentRepo: ExternalTournamentRepository,
  ) {}

  async getScore(
    tournamentSlug: string,
    owner: string,
  ): Promise<TournamentScore> {
    const tournament = await this.tournamentRepo.findBySlugAndOwner(
      tournamentSlug,
      owner,
    );
    const matchups = await this.matchupRepo.findByTournamentId(tournament._id!);
    return this.calculateScore(matchups);
  }

  async getExternalMatchups(
    tournamentSlug: string,
    owner: string,
  ): Promise<ExternalMatchup[]> {
    const tournament = await this.tournamentRepo.findBySlugAndOwner(
      tournamentSlug,
      owner,
    );
    return tournament.matchups;
  }

  async createExternalMatchup(
    tournamentId: string,
    owner: string,
    dto: ExternalMatchupDto,
  ): Promise<void> {
    const tournament = await this.tournamentRepo.findBySlugAndOwner(
      tournamentId,
      owner,
    );
    if (!tournament._id) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
    const payload = {
      aTeam: { _id: tournament._id },
      bTeam: {
        teamName: dto.teamName,
        coach: dto.coach ?? undefined,
        team: dto.team
          .filter((p) => p.id)
          .map((p) =>
            PokemonMapper.toDatabasePayload(
              PokemonMapper.fromForm(p, tournament.ruleset),
            ),
          ),
      },
      stage: dto.stage,
      matches: [],
    };
    await this.matchupRepo.create(payload);
  }
  async getExternalMatchup(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
  ): Promise<ExternalMatchup> {
    return this.getOwnedMatchup(tournamentSlug, externalmatchupId, owner);
  }

  async getExternalMatchupOpponent(
    tournamentId: string,
    externalmatchupId: string,
    owner: string,
  ) {
    return this.getOwnedMatchup(tournamentId, externalmatchupId, owner);
  }

  /**
   * Fetches a matchup only if it belongs to a tournament the caller owns.
   * Throws MATCHUP.NOT_FOUND otherwise, so callers can't read or mutate
   * matchups by guessing ids (IDOR guard for the by-matchupId endpoints).
   */
  private async getOwnedMatchup(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
  ): Promise<ExternalMatchup> {
    const tournament = await this.tournamentRepo.findBySlugAndOwner(
      tournamentSlug,
      owner,
    );
    const matchup = await this.matchupRepo.findById(externalmatchupId);
    if (matchup.aTeam.id?.toString() !== tournament._id?.toString()) {
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    }
    return matchup;
  }

  async updateExternalMatchupOpponent(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
    dto: ExternalMatchupDto,
  ): Promise<ExternalMatchup> {
    const existing = await this.getOwnedMatchup(
      tournamentSlug,
      externalmatchupId,
      owner,
    );
    const updated = ExternalMatchupMapper.fromForm(dto, existing);
    await this.matchupRepo.update(
      externalmatchupId,
      ExternalMatchupMapper.toDatabasePayload(updated),
    );
    return this.matchupRepo.findById(externalmatchupId);
  }

  async updateExternalMatchupScore(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
    dto: ScorePatchDto,
  ): Promise<void> {
    await this.getOwnedMatchup(tournamentSlug, externalmatchupId, owner);
    await this.matchupRepo.updateScore(
      externalmatchupId,
      dto.matches.map((match) => MatchMapper.fromForm(match)),
      dto.aTeamPaste,
      dto.bTeamPaste,
    );
  }

  async getExternalMatchupSchedule(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
  ) {
    const matchup = await this.getOwnedMatchup(
      tournamentSlug,
      externalmatchupId,
      owner,
    );
    return {
      gameTime: matchup.gameTime,
      reminder: matchup.reminder,
    };
  }

  async updateExternalMatchupSchedule(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
    dto: SchedulePatchDto,
  ): Promise<void> {
    await this.getOwnedMatchup(tournamentSlug, externalmatchupId, owner);
    await this.matchupRepo.update(externalmatchupId, {
      gameTime: dto.dateTime,
      reminder: dto.emailTime,
    });
  }

  async deleteExternalMatchup(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
  ): Promise<void> {
    await this.getOwnedMatchup(tournamentSlug, externalmatchupId, owner);
    await this.matchupRepo.delete(externalmatchupId);
  }

  private calculateScore(matchups: ExternalMatchup[]): TournamentScore {
    let wins = 0;
    let losses = 0;
    let netDiff = 0;

    for (const matchup of matchups) {
      if (!matchup.matches || matchup.matches.length === 0) continue;

      if (matchup.matches.length > 1) {
        let seriesWins = 0;
        let seriesLosses = 0;

        for (const match of matchup.matches) {
          if (match.winner === "a") seriesWins++;
          if (match.winner === "b") seriesLosses++;
        }

        if (seriesWins > seriesLosses) wins++;
        else if (seriesLosses > seriesWins) losses++;

        netDiff += seriesWins - seriesLosses;
      } else {
        const singleMatch = matchup.matches[0];
        const scoreA = singleMatch.aTeam?.score ?? 0;
        const scoreB = singleMatch.bTeam?.score ?? 0;

        if (scoreA > scoreB) wins++;
        else if (scoreA < scoreB) losses++;

        netDiff += scoreA - scoreB;
      }
    }

    return {
      wins,
      losses,
      diff: `${netDiff >= 0 ? "+" : ""}${netDiff}`,
    };
  }
}
