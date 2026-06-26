import { ExternalTournamentAdRepository } from "./external-tournament-ad.repository";
import { ExternalTournamentAdService } from "./external-tournament-ad.service";

describe("ExternalTournamentAdService", () => {
  let repo: jest.Mocked<ExternalTournamentAdRepository>;
  let service: ExternalTournamentAdService;

  beforeEach(() => {
    repo = {
      getOpenTournamentAds: jest.fn(),
      getMyTournamentAds: jest.fn(),
    } as unknown as jest.Mocked<ExternalTournamentAdRepository>;
    service = new ExternalTournamentAdService(repo);
  });

  describe("getExternalTournamentAds", () => {
    it("delegates to the repository's open-ads lookup", async () => {
      const ads = [{ leagueName: "Spring League" }] as any;
      repo.getOpenTournamentAds.mockResolvedValue(ads);

      const result = await service.getExternalTournamentAds();

      expect(repo.getOpenTournamentAds).toHaveBeenCalledWith();
      expect(result).toBe(ads);
    });
  });

  describe("getMyExternalTournamentAds", () => {
    it("delegates to the repository, scoped to the given owner", async () => {
      const ads = [{ leagueName: "Spring League" }] as any;
      repo.getMyTournamentAds.mockResolvedValue(ads);

      const result = await service.getMyExternalTournamentAds("auth0|owner");

      expect(repo.getMyTournamentAds).toHaveBeenCalledWith("auth0|owner");
      expect(result).toBe(ads);
    });
  });
});
