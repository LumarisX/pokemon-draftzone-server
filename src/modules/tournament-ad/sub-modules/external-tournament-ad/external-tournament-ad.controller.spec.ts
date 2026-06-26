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
    it("forwards the sub and returns the service's result directly (unmapped)", async () => {
      const ads = [{ leagueName: "Mine" }] as any;
      service.getMyExternalTournamentAds.mockResolvedValue(ads);

      const result = await controller.getExternalTournamentAdsManage("auth0|owner");

      expect(service.getMyExternalTournamentAds).toHaveBeenCalledWith("auth0|owner");
      expect(result).toBe(ads);
      expect(mockedMapper.toClientPayload).not.toHaveBeenCalled();
    });
  });

  describe("createExternalTournamentAdsManage", () => {
    it("delegates to the not-yet-implemented service stub", async () => {
      service.createExternalTournamentAd.mockResolvedValue(undefined);

      const result = await controller.createExternalTournamentAdsManage();

      expect(service.createExternalTournamentAd).toHaveBeenCalledWith();
      expect(result).toBeUndefined();
    });
  });

  describe("deleteExternalTournamentAd", () => {
    it("delegates to the not-yet-implemented service stub", async () => {
      service.deleteExternalTournamentAd.mockResolvedValue(undefined);

      const result = await controller.deleteExternalTournamentAd();

      expect(service.deleteExternalTournamentAd).toHaveBeenCalledWith();
      expect(result).toBeUndefined();
    });
  });
});
