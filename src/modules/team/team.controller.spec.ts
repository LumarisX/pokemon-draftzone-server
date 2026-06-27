import { CreateTeamDto, UpdateTeamDto } from "./team.dto";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

const COACH_ID = "507f191e810c19729de860ea";

describe("TeamController", () => {
  let service: jest.Mocked<TeamService>;
  let controller: TeamController;

  beforeEach(() => {
    service = {
      getTeam: jest.fn(),
      getTeams: jest.fn(),
      getTeamByCoach: jest.fn(),
      createTeam: jest.fn(),
      updateTeam: jest.fn(),
      deleteTeam: jest.fn(),
      canManageTeam: jest.fn(),
      canCreateTeamForCoach: jest.fn(),
      isCoachedBy: jest.fn(),
      getDraftedPokemonIds: jest.fn(),
    } as unknown as jest.Mocked<TeamService>;
    controller = new TeamController(service);
  });

  describe("findByCoach", () => {
    it("throws MISSING_FIELD when coachId is omitted", async () => {
      await expect(controller.findByCoach(undefined)).rejects.toMatchObject({
        code: "VAL-003",
      });
      expect(service.getTeamByCoach).not.toHaveBeenCalled();
    });

    it("forwards coachId to the service when provided", async () => {
      const team = { teamName: "Team Rocket" } as any;
      service.getTeamByCoach.mockResolvedValue(team);

      const result = await controller.findByCoach("coach-1");

      expect(service.getTeamByCoach).toHaveBeenCalledWith("coach-1");
      expect(result).toBe(team);
    });
  });

  describe("getTeam", () => {
    it("forwards the team id", async () => {
      const team = { teamName: "Team Rocket" } as any;
      service.getTeam.mockResolvedValue(team);

      const result = await controller.getTeam("team-1");

      expect(service.getTeam).toHaveBeenCalledWith("team-1");
      expect(result).toBe(team);
    });
  });

  describe("createTeam", () => {
    it("throws FORBIDDEN and doesn't create when the caller can't create for that coach", async () => {
      service.canCreateTeamForCoach.mockResolvedValue(false);
      const body = {
        tournamentId: "tournament-1",
        coachId: COACH_ID,
        teamName: "Team Rocket",
      } as CreateTeamDto;

      await expect(controller.createTeam("auth0|stranger", body)).rejects.toMatchObject({
        code: "AUTH-002",
      });
      expect(service.createTeam).not.toHaveBeenCalled();
    });

    it("creates the team when the caller is authorized", async () => {
      service.canCreateTeamForCoach.mockResolvedValue(true);
      const createdTeam = { teamName: "Team Rocket" } as any;
      service.createTeam.mockResolvedValue(createdTeam);
      const body = {
        tournamentId: "tournament-1",
        coachId: COACH_ID,
        teamName: "Team Rocket",
        logo: "logo-key",
      } as CreateTeamDto;

      const result = await controller.createTeam("auth0|coach-1", body);

      expect(service.canCreateTeamForCoach).toHaveBeenCalledWith(
        COACH_ID,
        "auth0|coach-1",
      );
      expect(service.createTeam).toHaveBeenCalledWith({
        tournamentId: "tournament-1",
        coach: COACH_ID,
        teamName: "Team Rocket",
        logo: "logo-key",
      });
      expect(result).toBe(createdTeam);
    });
  });

  describe("updateTeam", () => {
    it("throws FORBIDDEN and doesn't update when the caller can't manage the team", async () => {
      const team = { teamName: "Team Rocket" } as any;
      service.getTeam.mockResolvedValue(team);
      service.canManageTeam.mockResolvedValue(false);

      await expect(
        controller.updateTeam("team-1", "auth0|stranger", {} as UpdateTeamDto),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(service.updateTeam).not.toHaveBeenCalled();
    });

    it("updates the team when the caller is authorized", async () => {
      const team = { teamName: "Team Rocket" } as any;
      service.getTeam.mockResolvedValue(team);
      service.canManageTeam.mockResolvedValue(true);
      const updatedTeam = { teamName: "New Name" } as any;
      service.updateTeam.mockResolvedValue(updatedTeam);
      const body = { teamName: "New Name" } as UpdateTeamDto;

      const result = await controller.updateTeam("team-1", "auth0|coach-1", body);

      expect(service.canManageTeam).toHaveBeenCalledWith(team, "auth0|coach-1");
      expect(service.updateTeam).toHaveBeenCalledWith("team-1", body);
      expect(result).toBe(updatedTeam);
    });
  });

  describe("deleteTeam", () => {
    it("throws FORBIDDEN and doesn't delete when the caller can't manage the team", async () => {
      const team = { teamName: "Team Rocket" } as any;
      service.getTeam.mockResolvedValue(team);
      service.canManageTeam.mockResolvedValue(false);

      await expect(
        controller.deleteTeam("team-1", "auth0|stranger"),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(service.deleteTeam).not.toHaveBeenCalled();
    });

    it("deletes the team and returns a confirmation message when authorized", async () => {
      const team = { teamName: "Team Rocket" } as any;
      service.getTeam.mockResolvedValue(team);
      service.canManageTeam.mockResolvedValue(true);

      const result = await controller.deleteTeam("team-1", "auth0|coach-1");

      expect(service.deleteTeam).toHaveBeenCalledWith("team-1");
      expect(result).toEqual({ message: "Team deleted." });
    });
  });
});
