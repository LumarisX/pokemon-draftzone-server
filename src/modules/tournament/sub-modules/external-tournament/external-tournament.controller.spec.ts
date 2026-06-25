import { ExternalTournamentController } from "./external-tournament.controller";
import { ExternalTournamentDto } from "./external-tournament.dto";
import { ExternalTournamentMapper } from "./external-tournament.mapper";
import { ExternalTournamentService } from "./external-tournament.service";

jest.mock("./external-tournament.mapper", () => ({
  ExternalTournamentMapper: {
    toClientPayload: jest.fn(),
    fromForm: jest.fn(),
  },
}));

const mockedMapper = ExternalTournamentMapper as jest.Mocked<
  typeof ExternalTournamentMapper
>;

describe("ExternalTournamentController", () => {
  let service: jest.Mocked<ExternalTournamentService>;
  let controller: ExternalTournamentController;

  beforeEach(() => {
    service = {
      getTournaments: jest.fn(),
      getTournament: jest.fn(),
      createTournament: jest.fn(),
      updateTournament: jest.fn(),
      deleteTournament: jest.fn(),
      getTournamentStats: jest.fn(),
    } as unknown as jest.Mocked<ExternalTournamentService>;
    controller = new ExternalTournamentController(service);
  });

  describe("getTournaments", () => {
    it("maps every tournament to its client payload and wraps it in a drafts envelope", async () => {
      const tournamentA = { key: "a" } as any;
      const tournamentB = { key: "b" } as any;
      service.getTournaments.mockResolvedValue([tournamentA, tournamentB]);
      mockedMapper.toClientPayload
        .mockReturnValueOnce({ id: "a" } as any)
        .mockReturnValueOnce({ id: "b" } as any);

      const result = await controller.getTournaments("auth0|coach-1");

      expect(service.getTournaments).toHaveBeenCalledWith("auth0|coach-1");
      expect(mockedMapper.toClientPayload.mock.calls[0][0]).toBe(tournamentA);
      expect(mockedMapper.toClientPayload.mock.calls[1][0]).toBe(tournamentB);
      expect(result).toEqual({
        drafts: [{ id: "a" }, { id: "b" }],
        tournaments: [],
      });
    });
  });

  describe("createTournament", () => {
    it("maps the form body and forwards the result to the service", async () => {
      const body = { leagueName: "Spring League" } as ExternalTournamentDto;
      const mappedTournament = { key: "springleague" } as any;
      mockedMapper.fromForm.mockReturnValue(mappedTournament);

      await controller.createTournament(body, "auth0|coach-1");

      expect(mockedMapper.fromForm).toHaveBeenCalledWith(body, "auth0|coach-1");
      expect(service.createTournament).toHaveBeenCalledWith(mappedTournament);
    });
  });

  describe("getTournament", () => {
    it("fetches by key and owner and returns the client payload", async () => {
      const tournament = { key: "springleague" } as any;
      service.getTournament.mockResolvedValue(tournament);
      mockedMapper.toClientPayload.mockReturnValue({ id: "springleague" } as any);

      const result = await controller.getTournament(
        "springleague",
        "auth0|coach-1",
      );

      expect(service.getTournament).toHaveBeenCalledWith(
        "springleague",
        "auth0|coach-1",
      );
      expect(mockedMapper.toClientPayload).toHaveBeenCalledWith(tournament);
      expect(result).toEqual({ id: "springleague" });
    });
  });

  describe("updateTournament", () => {
    it("maps the form body, updates via the service, and returns a confirmation message", async () => {
      const body = { leagueName: "Spring League" } as ExternalTournamentDto;
      const mappedTournament = { key: "springleague" } as any;
      const updatedTournament = { key: "springleague", teamName: "Updated" } as any;
      mockedMapper.fromForm.mockReturnValue(mappedTournament);
      service.updateTournament.mockResolvedValue(updatedTournament);

      const result = await controller.updateTournament(
        "springleague",
        body,
        "auth0|coach-1",
      );

      expect(mockedMapper.fromForm).toHaveBeenCalledWith(body, "auth0|coach-1");
      expect(service.updateTournament).toHaveBeenCalledWith(
        "springleague",
        "auth0|coach-1",
        mappedTournament,
      );
      expect(result).toEqual({
        message: "Tournament updated",
        tournament: updatedTournament,
      });
    });
  });

  describe("deleteTournament", () => {
    it("deletes by key and owner and returns a confirmation message", async () => {
      const result = await controller.deleteTournament(
        "springleague",
        "auth0|coach-1",
      );

      expect(service.deleteTournament).toHaveBeenCalledWith(
        "springleague",
        "auth0|coach-1",
      );
      expect(result).toEqual({ message: "Tournament deleted" });
    });
  });

  describe("getStats", () => {
    it("forwards the key and owner and returns the service's stats directly", async () => {
      const stats = { pokemon: [] };
      service.getTournamentStats.mockResolvedValue(stats);

      const result = await controller.getStats("springleague", "auth0|coach-1");

      expect(service.getTournamentStats).toHaveBeenCalledWith(
        "springleague",
        "auth0|coach-1",
      );
      expect(result).toBe(stats);
    });
  });
});
