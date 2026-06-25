import { ExternalMatchupController } from "./external-matchup.controller";
import { ExternalMatchupDto, ScorePatchDto, SchedulePatchDto } from "./external-matchup.dto";
import { ExternalMatchupMapper } from "./external-matchup.mapper";
import { ExternalMatchupService } from "./external-matchup.service";

jest.mock("./external-matchup.mapper", () => ({
  ExternalMatchupMapper: {
    toClientPayload: jest.fn(),
  },
}));

const mockedMapper = ExternalMatchupMapper as jest.Mocked<
  typeof ExternalMatchupMapper
>;

describe("ExternalMatchupController", () => {
  let service: jest.Mocked<ExternalMatchupService>;
  let controller: ExternalMatchupController;

  beforeEach(() => {
    service = {
      getScore: jest.fn(),
      getExternalMatchups: jest.fn(),
      createExternalMatchup: jest.fn(),
      getExternalMatchup: jest.fn(),
      getExternalMatchupOpponent: jest.fn(),
      updateExternalMatchupOpponent: jest.fn(),
      updateExternalMatchupScore: jest.fn(),
      getExternalMatchupSchedule: jest.fn(),
      updateExternalMatchupSchedule: jest.fn(),
    } as unknown as jest.Mocked<ExternalMatchupService>;
    controller = new ExternalMatchupController(service);
  });

  describe("getScore", () => {
    it("fetches the tournament's matchups and maps each to a client payload", async () => {
      const matchupA = { stage: "a" } as any;
      const matchupB = { stage: "b" } as any;
      service.getExternalMatchups.mockResolvedValue([matchupA, matchupB]);
      mockedMapper.toClientPayload
        .mockReturnValueOnce({ id: "a" } as any)
        .mockReturnValueOnce({ id: "b" } as any);

      const result = await controller.getScore("springleague", "auth0|coach-1");

      expect(service.getExternalMatchups).toHaveBeenCalledWith(
        "springleague",
        "auth0|coach-1",
      );
      expect(mockedMapper.toClientPayload.mock.calls[0][0]).toBe(matchupA);
      expect(mockedMapper.toClientPayload.mock.calls[1][0]).toBe(matchupB);
      expect(result).toEqual([{ id: "a" }, { id: "b" }]);
    });
  });

  describe("getExternalMatchups", () => {
    it("fetches the tournament's matchups and maps each to a client payload", async () => {
      const matchup = { stage: "a" } as any;
      service.getExternalMatchups.mockResolvedValue([matchup]);
      mockedMapper.toClientPayload.mockReturnValue({ id: "a" } as any);

      const result = await controller.getExternalMatchups(
        "springleague",
        "auth0|coach-1",
      );

      expect(service.getExternalMatchups).toHaveBeenCalledWith(
        "springleague",
        "auth0|coach-1",
      );
      expect(result).toEqual([{ id: "a" }]);
    });
  });

  describe("createExternalMatchup", () => {
    it("forwards the tournament key, sub, and body to the service", async () => {
      const body = { teamName: "Challenger" } as ExternalMatchupDto;

      const result = await controller.createExternalMatchup(
        "springleague",
        "auth0|coach-1",
        body,
      );

      expect(service.createExternalMatchup).toHaveBeenCalledWith(
        "springleague",
        "auth0|coach-1",
        body,
      );
      expect(result).toEqual({ message: "ExternalMatchup Added" });
    });
  });

  describe("getExternalMatchup", () => {
    it("fetches by matchup id and returns the client payload", async () => {
      const matchup = { stage: "a" } as any;
      service.getExternalMatchup.mockResolvedValue(matchup);
      mockedMapper.toClientPayload.mockReturnValue({ id: "a" } as any);

      const result = await controller.getExternalMatchup(
        "springleague",
        "matchup-1",
        "auth0|coach-1",
      );

      expect(service.getExternalMatchup).toHaveBeenCalledWith("matchup-1");
      expect(mockedMapper.toClientPayload).toHaveBeenCalledWith(matchup);
      expect(result).toEqual({ id: "a" });
    });
  });

  describe("getExternalMatchupOpponent", () => {
    it("forwards the tournament key, matchup id, and sub to the service", async () => {
      const matchup = { stage: "a" } as any;
      service.getExternalMatchupOpponent.mockResolvedValue(matchup);
      mockedMapper.toClientPayload.mockReturnValue({ id: "a" } as any);

      const result = await controller.getExternalMatchupOpponent(
        "springleague",
        "matchup-1",
        "auth0|coach-1",
      );

      expect(service.getExternalMatchupOpponent).toHaveBeenCalledWith(
        "springleague",
        "matchup-1",
        "auth0|coach-1",
      );
      expect(result).toEqual({ id: "a" });
    });
  });

  describe("updateExternalMatchupOpponent", () => {
    it("updates via the service and returns the mapped result alongside a message", async () => {
      const body = { teamName: "Updated" } as ExternalMatchupDto;
      const updatedMatchup = { stage: "a" } as any;
      service.updateExternalMatchupOpponent.mockResolvedValue(updatedMatchup);
      mockedMapper.toClientPayload.mockReturnValue({ id: "a" } as any);

      const result = await controller.updateExternalMatchupOpponent(
        "springleague",
        "matchup-1",
        "auth0|coach-1",
        body,
      );

      expect(service.updateExternalMatchupOpponent).toHaveBeenCalledWith(
        "matchup-1",
        "auth0|coach-1",
        body,
      );
      expect(mockedMapper.toClientPayload).toHaveBeenCalledWith(updatedMatchup);
      expect(result).toEqual({
        message: "ExternalMatchup Updated",
        draft: { id: "a" },
      });
    });
  });

  describe("updateExternalMatchupScore", () => {
    it("forwards the matchup id and body to the service", async () => {
      const body = { matches: [] } as ScorePatchDto;

      const result = await controller.updateExternalMatchupScore(
        "springleague",
        "matchup-1",
        "auth0|coach-1",
        body,
      );

      expect(service.updateExternalMatchupScore).toHaveBeenCalledWith(
        "matchup-1",
        body,
      );
      expect(result).toEqual({ message: "Score Updated" });
    });
  });

  describe("getExternalMatchupSchedule", () => {
    it("forwards the matchup id and returns the service's result directly", async () => {
      const schedule = { gameTime: new Date(), reminder: undefined };
      service.getExternalMatchupSchedule.mockResolvedValue(schedule);

      const result = await controller.getExternalMatchupSchedule(
        "springleague",
        "matchup-1",
        "auth0|coach-1",
      );

      expect(service.getExternalMatchupSchedule).toHaveBeenCalledWith(
        "matchup-1",
      );
      expect(result).toBe(schedule);
    });
  });

  describe("updateExternalMatchupSchedule", () => {
    it("forwards the matchup id and body to the service", async () => {
      const body = { dateTime: "2026-02-01T00:00:00Z" } as SchedulePatchDto;

      const result = await controller.updateExternalMatchupSchedule(
        "springleague",
        "matchup-1",
        "auth0|coach-1",
        body,
      );

      expect(service.updateExternalMatchupSchedule).toHaveBeenCalledWith(
        "matchup-1",
        body,
      );
      expect(result).toEqual({ message: "Schedule Updated" });
    });
  });
});
