import {
  findTournamentByTeamId,
  isOrganizerOrOwner,
} from "@modules/tournament/tournament-access";
import { Types } from "mongoose";
import { CoachService } from "./coach.service";
import { CreateCoachDto, UpdateCoachDto } from "./coach.dto";
import { CoachRepository } from "./coach.repository";
import { CoachDocument } from "./coach.schema";

jest.mock("@modules/tournament/tournament-access", () => ({
  findTournamentByTeamId: jest.fn(),
  isOrganizerOrOwner: jest.fn(),
}));

const mockedFindTournamentByTeamId = findTournamentByTeamId as jest.Mock;
const mockedIsOrganizerOrOwner = isOrganizerOrOwner as jest.Mock;

function buildCoach(overrides: Partial<CoachDocument> = {}): CoachDocument {
  return {
    _id: new Types.ObjectId(),
    auth0Id: "auth0|coach-1",
    teamId: new Types.ObjectId(),
    ...overrides,
  } as unknown as CoachDocument;
}

function buildCreateDto(overrides: Partial<CreateCoachDto> = {}): CreateCoachDto {
  return {
    teamId: "team-1",
    name: "Ash Ketchum",
    gameName: "AshK",
    discordName: "ash#1234",
    timezone: "America/Los_Angeles",
    experience: "5 years",
    droppedBefore: false,
    droppedWhy: "",
    confirm: true,
    ...overrides,
  };
}

describe("CoachService", () => {
  let coachRepo: jest.Mocked<CoachRepository>;
  let service: CoachService;

  beforeEach(() => {
    coachRepo = {
      findById: jest.fn(),
      findByAuth0Id: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<CoachRepository>;
    service = new CoachService(coachRepo);
  });

  describe("getCoach", () => {
    it("delegates to the repository", async () => {
      const coach = buildCoach();
      coachRepo.findById.mockResolvedValue(coach);

      const result = await service.getCoach("coach-1");

      expect(coachRepo.findById).toHaveBeenCalledWith("coach-1");
      expect(result).toBe(coach);
    });
  });

  describe("createCoach", () => {
    it("rejects when droppedBefore is set without a droppedWhy reason", async () => {
      const dto = buildCreateDto({ droppedBefore: true, droppedWhy: "   " });

      await expect(service.createCoach("auth0|sub", dto)).rejects.toMatchObject({
        code: "VAL-003",
      });
      expect(coachRepo.create).not.toHaveBeenCalled();
    });

    it("rejects when the confirmation checkbox isn't checked", async () => {
      const dto = buildCreateDto({ confirm: false });

      await expect(service.createCoach("auth0|sub", dto)).rejects.toMatchObject({
        code: "VAL-003",
      });
      expect(coachRepo.create).not.toHaveBeenCalled();
    });

    it("creates the coach with the submitted fields on success", async () => {
      const dto = buildCreateDto();
      const createdCoach = buildCoach();
      coachRepo.create.mockResolvedValue(createdCoach);

      const result = await service.createCoach("auth0|sub", dto);

      expect(coachRepo.create).toHaveBeenCalledWith({
        auth0Id: "auth0|sub",
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
      expect(result).toBe(createdCoach);
    });

    it("allows droppedBefore with a non-empty droppedWhy", async () => {
      const dto = buildCreateDto({ droppedBefore: true, droppedWhy: "moved away" });
      coachRepo.create.mockResolvedValue(buildCoach());

      await expect(service.createCoach("auth0|sub", dto)).resolves.toBeDefined();
      expect(coachRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateCoach", () => {
    it("throws FORBIDDEN when the caller doesn't own the coach and isn't an organizer/owner", async () => {
      const coach = buildCoach({ auth0Id: "auth0|owner-coach" });
      coachRepo.findById.mockResolvedValue(coach);
      mockedFindTournamentByTeamId.mockResolvedValue(null);

      await expect(
        service.updateCoach("coach-1", "auth0|stranger", {} as UpdateCoachDto),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(coachRepo.update).not.toHaveBeenCalled();
    });

    it("allows the coach to update their own record without checking the tournament", async () => {
      const coach = buildCoach({ auth0Id: "auth0|coach-1" });
      coachRepo.findById.mockResolvedValue(coach);
      const updated = buildCoach({ auth0Id: "auth0|coach-1" });
      coachRepo.update.mockResolvedValue(updated);

      const result = await service.updateCoach("coach-1", "auth0|coach-1", {
        name: "New Name",
      });

      expect(mockedFindTournamentByTeamId).not.toHaveBeenCalled();
      expect(coachRepo.update).toHaveBeenCalledWith("coach-1", { name: "New Name" });
      expect(result).toBe(updated);
    });

    it("allows a tournament organizer/owner to update someone else's coach record", async () => {
      const coach = buildCoach({ auth0Id: "auth0|other-coach" });
      coachRepo.findById.mockResolvedValue(coach);
      mockedFindTournamentByTeamId.mockResolvedValue({
        owner: "auth0|owner",
        organizers: [],
      });
      mockedIsOrganizerOrOwner.mockReturnValue(true);
      coachRepo.update.mockResolvedValue(coach);

      await service.updateCoach("coach-1", "auth0|owner", { name: "New Name" });

      expect(coachRepo.update).toHaveBeenCalledWith("coach-1", { name: "New Name" });
    });

    it("only includes explicitly provided fields in the update", async () => {
      const coach = buildCoach({ auth0Id: "auth0|coach-1" });
      coachRepo.findById.mockResolvedValue(coach);
      coachRepo.update.mockResolvedValue(coach);

      await service.updateCoach("coach-1", "auth0|coach-1", {
        gameName: "NewGameName",
      });

      expect(coachRepo.update).toHaveBeenCalledWith("coach-1", {
        gameName: "NewGameName",
      });
    });
  });

  describe("deleteCoach", () => {
    it("throws FORBIDDEN when the caller can't manage the coach", async () => {
      const coach = buildCoach({ auth0Id: "auth0|owner-coach" });
      coachRepo.findById.mockResolvedValue(coach);
      mockedFindTournamentByTeamId.mockResolvedValue(null);

      await expect(
        service.deleteCoach("coach-1", "auth0|stranger"),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(coachRepo.delete).not.toHaveBeenCalled();
    });

    it("deletes when the caller owns the coach", async () => {
      const coach = buildCoach({ auth0Id: "auth0|coach-1" });
      coachRepo.findById.mockResolvedValue(coach);

      await service.deleteCoach("coach-1", "auth0|coach-1");

      expect(coachRepo.delete).toHaveBeenCalledWith("coach-1");
    });
  });

  describe("canManageCoach", () => {
    it("returns true when sub owns the coach, without consulting the tournament", async () => {
      const coach = buildCoach({ auth0Id: "auth0|coach-1" });

      const result = await service.canManageCoach(coach, "auth0|coach-1");

      expect(result).toBe(true);
      expect(mockedFindTournamentByTeamId).not.toHaveBeenCalled();
    });

    it("returns false when the coach's tournament can't be found", async () => {
      const coach = buildCoach({ auth0Id: "auth0|coach-1" });
      mockedFindTournamentByTeamId.mockResolvedValue(null);

      const result = await service.canManageCoach(coach, "auth0|stranger");

      expect(result).toBe(false);
    });

    it("returns the isOrganizerOrOwner result when the tournament is found", async () => {
      const coach = buildCoach({ auth0Id: "auth0|coach-1" });
      const tournament = { owner: "auth0|owner", organizers: [] };
      mockedFindTournamentByTeamId.mockResolvedValue(tournament);
      mockedIsOrganizerOrOwner.mockReturnValue(true);

      const result = await service.canManageCoach(coach, "auth0|owner");

      expect(mockedFindTournamentByTeamId).toHaveBeenCalledWith(coach.teamId);
      expect(mockedIsOrganizerOrOwner).toHaveBeenCalledWith(tournament, "auth0|owner");
      expect(result).toBe(true);
    });
  });

  describe("isOwnedBy", () => {
    it("delegates to the coach.domain helper", () => {
      const coach = buildCoach({ auth0Id: "auth0|coach-1" });

      expect(service.isOwnedBy(coach, "auth0|coach-1")).toBe(true);
      expect(service.isOwnedBy(coach, "auth0|other")).toBe(false);
    });
  });
});
