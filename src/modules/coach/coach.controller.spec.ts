import { CoachController } from "./coach.controller";
import { CreateCoachDto, UpdateCoachDto } from "./coach.dto";
import { CoachService } from "./coach.service";

describe("CoachController", () => {
  let service: jest.Mocked<CoachService>;
  let controller: CoachController;

  beforeEach(() => {
    service = {
      getCoach: jest.fn(),
      createCoach: jest.fn(),
      updateCoach: jest.fn(),
      deleteCoach: jest.fn(),
    } as unknown as jest.Mocked<CoachService>;
    controller = new CoachController(service);
  });

  it("getCoach forwards the coach id", async () => {
    const coach = { name: "Ash" } as any;
    service.getCoach.mockResolvedValue(coach);

    const result = await controller.getCoach("coach-1");

    expect(service.getCoach).toHaveBeenCalledWith("coach-1");
    expect(result).toBe(coach);
  });

  it("createCoach forwards sub and body", async () => {
    const body = { name: "Ash" } as CreateCoachDto;
    const coach = { name: "Ash" } as any;
    service.createCoach.mockResolvedValue(coach);

    const result = await controller.createCoach("auth0|coach-1", body);

    expect(service.createCoach).toHaveBeenCalledWith("auth0|coach-1", body);
    expect(result).toBe(coach);
  });

  it("updateCoach forwards the coach id, sub, and body", async () => {
    const body = { name: "New Name" } as UpdateCoachDto;
    const coach = { name: "New Name" } as any;
    service.updateCoach.mockResolvedValue(coach);

    const result = await controller.updateCoach("coach-1", "auth0|coach-1", body);

    expect(service.updateCoach).toHaveBeenCalledWith(
      "coach-1",
      "auth0|coach-1",
      body,
    );
    expect(result).toBe(coach);
  });

  it("deleteCoach deletes and returns a confirmation message", async () => {
    const result = await controller.deleteCoach("coach-1", "auth0|coach-1");

    expect(service.deleteCoach).toHaveBeenCalledWith("coach-1", "auth0|coach-1");
    expect(result).toEqual({ message: "Coach deleted." });
  });
});
