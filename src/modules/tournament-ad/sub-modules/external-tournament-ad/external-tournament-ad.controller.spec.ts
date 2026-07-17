import { ExternalTournamentAdController } from "./external-tournament-ad.controller";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";
import { ExternalTournamentAdService } from "./external-tournament-ad.service";

jest.mock("./external-tournament-ad.mapper", () => ({
  ExternalTournamentAdMapper: {
    toClientPayload: jest.fn(),
  },
}));

const mockedMapper = ExternalTournamentAdMapper as jest.Mocked<
  typeof ExternalTournamentAdMapper
>;

describe("ExternalTournamentAdController", () => {
  let service: jest.Mocked<ExternalTournamentAdService>;
  let controller: ExternalTournamentAdController;

  beforeEach(() => {
    service = {
      getExternalTournamentAds: jest.fn(),
      getMyExternalTournamentAds: jest.fn(),
      createExternalTournamentAd: jest.fn(),
      deleteExternalTournamentAd: jest.fn(),
    } as unknown as jest.Mocked<ExternalTournamentAdService>;
    controller = new ExternalTournamentAdController(service);
  });

  describe("getExternalTournamentAds", () => {
    it("maps every open ad to its client payload", async () => {
      const adA = { leagueName: "A" } as any;
      const adB = { leagueName: "B" } as any;
      service.getExternalTournamentAds.mockResolvedValue([adA, adB]);
      mockedMapper.toClientPayload
        .mockReturnValueOnce({ leagueName: "A-mapped" } as any)
        .mockReturnValueOnce({ leagueName: "B-mapped" } as any);

      const result = await controller.getExternalTournamentAds();

      expect(mockedMapper.toClientPayload.mock.calls[0][0]).toBe(adA);
      expect(mockedMapper.toClientPayload.mock.calls[1][0]).toBe(adB);
      expect(result).toEqual([{ leagueName: "A-mapped" }, { leagueName: "B-mapped" }]);
    });
  });

  describe("getExternalTournamentAdsManage", () => {
    it("forwards the sub and maps the user's ads to client payloads", async () => {
      const ad = { leagueName: "Mine" } as any;
      service.getMyExternalTournamentAds.mockResolvedValue([ad]);
      mockedMapper.toClientPayload.mockReturnValueOnce({
        leagueName: "Mine-mapped",
      } as any);

      const result = await controller.getExternalTournamentAdsManage("auth0|owner");

      expect(service.getMyExternalTournamentAds).toHaveBeenCalledWith("auth0|owner");
      expect(mockedMapper.toClientPayload.mock.calls[0][0]).toBe(ad);
      expect(result).toEqual([{ leagueName: "Mine-mapped" }]);
    });
  });

  describe("createExternalTournamentAdsManage", () => {
    it("creates the ad for the authenticated user and returns its client payload", async () => {
      const dto = { leagueName: "New" } as any;
      const created = { leagueName: "New", _id: "abc" } as any;
      service.createExternalTournamentAd.mockResolvedValue(created);
      mockedMapper.toClientPayload.mockReturnValueOnce({
        leagueName: "New-mapped",
      } as any);

      const result = await controller.createExternalTournamentAdsManage(
        dto,
        "auth0|owner",
      );

      expect(service.createExternalTournamentAd).toHaveBeenCalledWith(
        dto,
        "auth0|owner",
      );
      expect(mockedMapper.toClientPayload).toHaveBeenCalledWith(created);
      expect(result).toEqual({ leagueName: "New-mapped" });
    });
  });

  describe("deleteExternalTournamentAd", () => {
    it("deletes the ad scoped to the authenticated user", async () => {
      service.deleteExternalTournamentAd.mockResolvedValue(undefined);

      const result = await controller.deleteExternalTournamentAd(
        "ad-id",
        "auth0|owner",
      );

      expect(service.deleteExternalTournamentAd).toHaveBeenCalledWith(
        "ad-id",
        "auth0|owner",
      );
      expect(result).toEqual({ message: "Advertisement deleted." });
    });
  });
});
