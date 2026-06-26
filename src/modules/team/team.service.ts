import { isOwnedBy } from "@modules/coach/coach.domain";
import { CoachRepository } from "@modules/coach/coach.repository";
import {
  findTournamentById,
  findTournamentByTeamId,
  isOrganizerOrOwner,
} from "@modules/tournament/tournament-access";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { getDraftedPokemonIds, isCoachedBy } from "./team.domain";
import {
  CreateTeamInput,
  PopulatedTeam,
  TeamRepository,
} from "./team.repository";

@Injectable()
export class TeamService {
  constructor(
    private readonly teamRepo: TeamRepository,
    private readonly coachRepo: CoachRepository,
  ) {}

  async getTeam(teamId: Types.ObjectId | string): Promise<PopulatedTeam> {
    return this.teamRepo.findById(teamId);
  }

  async getTeams(
    teamIds: (Types.ObjectId | string)[],
  ): Promise<PopulatedTeam[]> {
    return this.teamRepo.findManyByIds(teamIds);
  }

  async getTeamByCoach(
    coachId: Types.ObjectId | string,
  ): Promise<PopulatedTeam | null> {
    return this.teamRepo.findByCoachId(coachId);
  }

  async createTeam(data: CreateTeamInput): Promise<PopulatedTeam> {
    return this.teamRepo.create(data);
  }

  async updateTeam(
    teamId: Types.ObjectId | string,
    data: { teamName?: string; logo?: string },
  ): Promise<PopulatedTeam> {
    return this.teamRepo.update(teamId, data);
  }

  async deleteTeam(teamId: Types.ObjectId | string): Promise<void> {
    return this.teamRepo.delete(teamId);
  }

  isCoachedBy(team: PopulatedTeam, sub: string | undefined): boolean {
    return isCoachedBy(team, sub);
  }

  getDraftedPokemonIds(team: PopulatedTeam): string[] {
    return getDraftedPokemonIds(team);
  }

  /** Tournament organizers/owners and the team's own coach may change a team. */
  async canManageTeam(
    team: PopulatedTeam,
    sub: string | undefined,
  ): Promise<boolean> {
    if (isCoachedBy(team, sub)) return true;
    const tournament = await findTournamentById(team.tournamentId);
    if (!tournament) return false;
    return isOrganizerOrOwner(tournament, sub);
  }

  /** Used for creation, where no team exists yet to check membership against. */
  async canCreateTeamForCoach(
    coachId: Types.ObjectId | string,
    sub: string | undefined,
  ): Promise<boolean> {
    const coach = await this.coachRepo.findById(coachId);
    if (isOwnedBy(coach, sub)) return true;
    const tournament = await findTournamentByTeamId(coach.teamId);
    if (!tournament) return false;
    return isOrganizerOrOwner(tournament, sub);
  }
}
