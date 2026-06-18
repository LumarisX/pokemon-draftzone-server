import { Injectable, NotFoundException } from "@nestjs/common";
import { ErrorCodes } from "../../../../../errors/error-codes";
import { ExternalMatchup } from "./external-matchup.domain";
import {
  ExternalMatchupDto,
  SchedulePatchDto,
  ScorePatchDto,
} from "./external-matchup.dto";
import { ExternalMatchupMapper } from "./external-matchup.mapper";
import { ExternalMatchupRepository } from "./external-matchup.repository";
import { ExternalTournamentRepository } from "../external-tournament.repository";

@Injectable()
export class ExternalMatchupService {
  constructor(
    private readonly matchupRepo: ExternalMatchupRepository,
    private readonly tournamentRepo: ExternalTournamentRepository,
  ) {}

  async getExternalMatchups(
    tournamentKey: string,
    owner: string,
  ): Promise<ExternalMatchup[]> {
    const tournament = await this.tournamentRepo.findByKeyAndOwner(
      tournamentKey,
      owner,
    );
    return tournament.matchups;
  }

  async createExternalMatchup(
    tournamentId: string,
    owner: string,
    dto: ExternalMatchupDto,
  ): Promise<void> {
    const tournament = await this.tournamentRepo.findByKeyAndOwner(
      tournamentId,
      owner,
    );
    if (!tournament._id)
      throw new NotFoundException(ErrorCodes.DRAFT.NOT_FOUND);
    const matchup = ExternalMatchupMapper.fromForm(dto, tournament.ruleset);
    const payload = {
      ...ExternalMatchupMapper.toDatabasePayload(matchup),
      aTeam: { _id: tournament._id },
      matches: [],
    };
    await this.matchupRepo.create(payload);
  }

  async getExternalMatchup(
    externalmatchupId: string,
  ): Promise<ExternalMatchup> {
    return this.matchupRepo.findById(externalmatchupId);
  }

  async getExternalMatchupOpponent(
    tournamentId: string,
    externalmatchupId: string,
    owner: string,
  ) {
    const matchup = await this.matchupRepo.findById(externalmatchupId);
    return ExternalMatchupMapper.toClientPayload(matchup);
  }

  async updateExternalMatchupOpponent(
    externalmatchupId: string,
    owner: string,
    dto: ExternalMatchupDto,
  ): Promise<ExternalMatchup> {
    const existing = await this.matchupRepo.findById(externalmatchupId);
    const updated = ExternalMatchupMapper.fromForm(dto, existing.ruleset);
    await this.matchupRepo.update(
      externalmatchupId,
      ExternalMatchupMapper.toDatabasePayload(updated),
    );
    return this.matchupRepo.findById(externalmatchupId);
  }

  async updateExternalMatchupScore(
    externalmatchupId: string,
    dto: ScorePatchDto,
  ): Promise<void> {
    await this.matchupRepo.updateScore(
      externalmatchupId,
      dto.matches as any,
      dto.aTeamPaste,
      dto.bTeamPaste,
    );
  }

  async getExternalMatchupSchedule(externalmatchupId: string) {
    const matchup = await this.matchupRepo.findById(externalmatchupId);
    return {
      gameTime: (matchup as any).gameTime,
      reminder: (matchup as any).reminder,
    };
  }

  async updateExternalMatchupSchedule(
    externalmatchupId: string,
    dto: SchedulePatchDto,
  ): Promise<void> {
    await this.matchupRepo.update(externalmatchupId, {
      gameTime: dto.dateTime,
      reminder: dto.emailTime,
    });
  }
}
