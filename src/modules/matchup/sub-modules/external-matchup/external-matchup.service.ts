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
  MatchSchedulePatchDto,
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
      scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      opponentTimezone: dto.opponentTimezone,
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

  async updateExternalMatchupSchedule(
    tournamentSlug: string,
    externalmatchupId: string,
    owner: string,
    dto: MatchSchedulePatchDto,
  ): Promise<ExternalMatchup> {
    await this.getOwnedMatchup(tournamentSlug, externalmatchupId, owner);
    await this.matchupRepo.updateSchedule(
      externalmatchupId,
      dto.scheduledDate ? new Date(dto.scheduledDate) : null,
      dto.opponentTimezone,
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
      {
        aTeamPaste: dto.aTeamPaste,
        bTeamPaste: dto.bTeamPaste,
        scoreOverride: dto.scoreOverride,
        winnerOverride: dto.winnerOverride,
        forfeitedBy: dto.forfeitedBy,
      },
    );
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
      if (matchup.isDoubleForfeit()) {
        losses++;
        continue;
      }

      const score = matchup.calculateScore();
      const winner = matchup.calculateWinner();
      if (!score && !winner) continue;

      if (winner === "a") wins++;
      else if (winner === "b") losses++;

      if (score) netDiff += score[0] - score[1];
    }

    return {
      wins,
      losses,
      diff: `${netDiff >= 0 ? "+" : ""}${netDiff}`,
    };
  }
}
