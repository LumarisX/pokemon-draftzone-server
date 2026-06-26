import {
  findTournamentByTeamId,
  isOrganizerOrOwner,
} from "@modules/tournament/tournament-access";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { CoachDocument } from "./coach.schema";
import { CreateCoachDto, UpdateCoachDto } from "./coach.dto";
import { isOwnedBy } from "./coach.domain";
import { CoachRepository, UpdateCoachInput } from "./coach.repository";

@Injectable()
export class CoachService {
  constructor(private readonly coachRepo: CoachRepository) {}

  async getCoach(coachId: Types.ObjectId | string): Promise<CoachDocument> {
    return this.coachRepo.findById(coachId);
  }

  /** Self-service signup creation, used by the dedicated coach CRUD endpoint. Requires an existing Team to attach to. */
  async createCoach(sub: string, dto: CreateCoachDto): Promise<CoachDocument> {
    if (dto.droppedBefore && !dto.droppedWhy.trim()) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "droppedWhy",
      });
    }
    if (!dto.confirm) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "confirm",
      });
    }

    return this.coachRepo.create({
      auth0Id: sub,
      name: dto.name,
      gameName: dto.gameName,
      discordName: dto.discordName,
      timezone: dto.timezone,
      teamId: dto.teamId,
      experience: dto.experience,
      droppedBefore: dto.droppedBefore,
      droppedWhy: dto.droppedWhy,
      confirmed: dto.confirm,
    });
  }

  async updateCoach(
    coachId: Types.ObjectId | string,
    sub: string | undefined,
    dto: UpdateCoachDto,
  ): Promise<CoachDocument> {
    const coach = await this.coachRepo.findById(coachId);
    const canManage = await this.canManageCoach(coach, sub);
    if (!canManage) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const update: UpdateCoachInput = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.gameName !== undefined) update.gameName = dto.gameName;
    if (dto.discordName !== undefined) update.discordName = dto.discordName;
    if (dto.timezone !== undefined) update.timezone = dto.timezone;
    if (dto.experience !== undefined) update.experience = dto.experience;
    if (dto.droppedBefore !== undefined) update.droppedBefore = dto.droppedBefore;
    if (dto.droppedWhy !== undefined) update.droppedWhy = dto.droppedWhy;

    return this.coachRepo.update(coachId, update);
  }

  async deleteCoach(
    coachId: Types.ObjectId | string,
    sub: string | undefined,
  ): Promise<void> {
    const coach = await this.coachRepo.findById(coachId);
    const canDelete = await this.canManageCoach(coach, sub);
    if (!canDelete) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    await this.coachRepo.delete(coachId);
  }

  isOwnedBy(coach: CoachDocument, sub: string | undefined): boolean {
    return isOwnedBy(coach, sub);
  }

  async canManageCoach(
    coach: CoachDocument,
    sub: string | undefined,
  ): Promise<boolean> {
    if (isOwnedBy(coach, sub)) return true;
    const tournament = await findTournamentByTeamId(coach.teamId);
    if (!tournament) return false;
    return isOrganizerOrOwner(tournament, sub);
  }
}
