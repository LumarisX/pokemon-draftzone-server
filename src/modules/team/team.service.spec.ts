import { CoachRepository } from "@modules/coach/coach.repository";
import { CoachDocument } from "@modules/coach/coach.schema";
import {
  findTournamentById,
  findTournamentByTeamId,
  isOrganizerOrOwner,
} from "@modules/tournament/tournament-access";
import { Types } from "mongoose";
import { CreateTeamInput, PopulatedTeam, TeamRepository } from "./team.repository";
import { TeamService } from "./team.service";

jest.mock("@modules/tournament/tournament-access", () => ({
  findTournamentById: jest.fn(),
  findTournamentByTeamId: jest.fn(),
  isOrganizerOrOwner: jest.fn(),
}));

const mockedFindTournamentById = findTournamentById as jest.Mock;
const mockedFindTournamentByTeamId = findTournamentByTeamId as jest.Mock;
const mockedIsOrganizerOrOwner = isOrganizerOrOwner as jest.Mock;

function buildTeam(overrides: Record<string, unknown> = {}): PopulatedTeam {
  return {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(),
    coach: { auth0Id: "auth0|coach-1" } as CoachDocument,
    pickLog: [],
    ...overrides,
  } as unknown as PopulatedTeam;
}

describe("TeamService", () => {
  let teamRepo: jest.Mocked<TeamRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let service: TeamService;

  beforeEach(() => {
    teamRepo = {
      findById: jest.fn(),
      findManyByIds: jest.fn(),
      findByCoachId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;
    coachRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<CoachRepository>;
    service = new TeamService(teamRepo, coachRepo);
  });

  describe("simple delegation", () => {
    it("getTeam delegates to the repository", async () => {
      const team = buildTeam();
      teamRepo.findById.mockResolvedValue(team);

      await expect(service.getTeam("team-1")).resolves.toBe(team);
      expect(teamRepo.findById).toHaveBeenCalledWith("team-1");
    });

    it("getTeams delegates to the repository", async () => {
      const teams = [buildTeam()];
      teamRepo.findManyByIds.mockResolvedValue(teams);

      await expect(service.getTeams(["team-1", "team-2"])).resolves.toBe(teams);
      expect(teamRepo.findManyByIds).toHaveBeenCalledWith(["team-1", "team-2"]);
    });

    it("getTeamByCoach delegates to the repository", async () => {
      const team = buildTeam();
      teamRepo.findByCoachId.mockResolvedValue(team);

      await expect(service.getTeamByCoach("coach-1")).resolves.toBe(team);
      expect(teamRepo.findByCoachId).toHaveBeenCalledWith("coach-1");
    });

    it("createTeam delegates to the repository", async () => {
      const input = { teamName: "Team Rocket" } as CreateTeamInput;
      const team = buildTeam();
      teamRepo.create.mockResolvedValue(team);

      await expect(service.createTeam(input)).resolves.toBe(team);
      expect(teamRepo.create).toHaveBeenCalledWith(input);
    });

    it("updateTeam delegates to the repository", async () => {
      const team = buildTeam();
      teamRepo.update.mockResolvedValue(team);

      await expect(
        service.updateTeam("team-1", { teamName: "New Name" }),
      ).resolves.toBe(team);
      expect(teamRepo.update).toHaveBeenCalledWith("team-1", { teamName: "New Name" });
    });

    it("deleteTeam delegates to the repository", async () => {
      await service.deleteTeam("team-1");

      expect(teamRepo.delete).toHaveBeenCalledWith("team-1");
    });
  });

  describe("isCoachedBy / getDraftedPokemonIds", () => {
    it("delegate to the team.domain helpers", () => {
      const team = buildTeam({
        coach: { auth0Id: "auth0|coach-1" } as CoachDocument,
        pickLog: [{ pokemon: { id: "pikachu" } }] as any,
      });

      expect(service.isCoachedBy(team, "auth0|coach-1")).toBe(true);
      expect(service.getDraftedPokemonIds(team)).toEqual(["pikachu"]);
    });
  });

  describe("canManageTeam", () => {
    it("returns true when sub is the team's own coach, without checking the tournament", async () => {
      const team = buildTeam({ coach: { auth0Id: "auth0|coach-1" } as CoachDocument });

      const result = await service.canManageTeam(team, "auth0|coach-1");

      expect(result).toBe(true);
      expect(mockedFindTournamentById).not.toHaveBeenCalled();
    });

    it("returns false when the team's tournament can't be found", async () => {
      const team = buildTeam();
      mockedFindTournamentById.mockResolvedValue(null);

      const result = await service.canManageTeam(team, "auth0|stranger");

      expect(result).toBe(false);
    });

    it("returns the isOrganizerOrOwner result when the tournament is found", async () => {
      const team = buildTeam();
      const tournament = { owner: "auth0|owner", organizers: [] };
      mockedFindTournamentById.mockResolvedValue(tournament);
      mockedIsOrganizerOrOwner.mockReturnValue(true);

      const result = await service.canManageTeam(team, "auth0|owner");

      expect(mockedFindTournamentById).toHaveBeenCalledWith(team.tournamentId);
      expect(mockedIsOrganizerOrOwner).toHaveBeenCalledWith(tournament, "auth0|owner");
      expect(result).toBe(true);
    });
  });

  describe("canCreateTeamForCoach", () => {
    it("returns true when sub owns the coach, without checking the tournament", async () => {
      coachRepo.findById.mockResolvedValue({
        auth0Id: "auth0|coach-1",
        teamId: new Types.ObjectId(),
      } as CoachDocument);

      const result = await service.canCreateTeamForCoach("coach-1", "auth0|coach-1");

      expect(result).toBe(true);
      expect(mockedFindTournamentByTeamId).not.toHaveBeenCalled();
    });

    it("returns false when the coach's tournament can't be found", async () => {
      coachRepo.findById.mockResolvedValue({
        auth0Id: "auth0|coach-1",
        teamId: new Types.ObjectId(),
      } as CoachDocument);
      mockedFindTournamentByTeamId.mockResolvedValue(null);

      const result = await service.canCreateTeamForCoach("coach-1", "auth0|stranger");

      expect(result).toBe(false);
    });

    it("returns the isOrganizerOrOwner result when the coach's tournament is found", async () => {
      const coachTeamId = new Types.ObjectId();
      coachRepo.findById.mockResolvedValue({
        auth0Id: "auth0|coach-1",
        teamId: coachTeamId,
      } as CoachDocument);
      const tournament = { owner: "auth0|owner", organizers: [] };
      mockedFindTournamentByTeamId.mockResolvedValue(tournament);
      mockedIsOrganizerOrOwner.mockReturnValue(true);

      const result = await service.canCreateTeamForCoach("coach-1", "auth0|owner");

      expect(mockedFindTournamentByTeamId).toHaveBeenCalledWith(coachTeamId);
      expect(result).toBe(true);
    });
  });
});
