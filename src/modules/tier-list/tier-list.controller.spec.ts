import { TierListController } from "./tier-list.controller";
import { UpdateTierListDto, UpdateTierListSettingsDto } from "./tier-list.dto";
import { TierListService } from "./tier-list.service";

describe("TierListController", () => {
  let service: jest.Mocked<TierListService>;
  let controller: TierListController;

  beforeEach(() => {
    service = {
      getTierList: jest.fn(),
      updateTierList: jest.fn(),
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
    } as unknown as jest.Mocked<TierListService>;
    controller = new TierListController(service);
  });

  describe("getTierList", () => {
    it("forwards the tier list id, sub, and parses edit=true from the query string", async () => {
      const view = { tierList: [] } as any;
      service.getTierList.mockResolvedValue(view);

      const result = await controller.getTierList("tierlist-1", "auth0|owner", "true");

      expect(service.getTierList).toHaveBeenCalledWith("tierlist-1", "auth0|owner", true);
      expect(result).toBe(view);
    });

    it("treats a missing or non-'true' edit query param as view-only", async () => {
      service.getTierList.mockResolvedValue({} as any);

      await controller.getTierList("tierlist-1", undefined, undefined);
      expect(service.getTierList).toHaveBeenCalledWith("tierlist-1", undefined, false);

      await controller.getTierList("tierlist-1", undefined, "yes");
      expect(service.getTierList).toHaveBeenCalledWith("tierlist-1", undefined, false);
    });
  });

  describe("updateTierList", () => {
    it("forwards the tier list id, sub, and body", async () => {
      const body = { tiers: [] } as UpdateTierListDto;
      const response = { success: true, message: "Tier list updated successfully" };
      service.updateTierList.mockResolvedValue(response);

      const result = await controller.updateTierList("tierlist-1", "auth0|owner", body);

      expect(service.updateTierList).toHaveBeenCalledWith(
        "tierlist-1",
        "auth0|owner",
        body,
      );
      expect(result).toBe(response);
    });
  });

  describe("getTierListSettings", () => {
    it("forwards the tier list id", async () => {
      const settings = { name: "Spring Tier List" } as any;
      service.getSettings.mockResolvedValue(settings);

      const result = await controller.getTierListSettings("tierlist-1");

      expect(service.getSettings).toHaveBeenCalledWith("tierlist-1");
      expect(result).toBe(settings);
    });
  });

  describe("updateTierListSettings", () => {
    it("forwards the tier list id, sub, and body", async () => {
      const body = { name: "New Name" } as UpdateTierListSettingsDto;
      const response = { success: true };
      service.updateSettings.mockResolvedValue(response);

      const result = await controller.updateTierListSettings(
        "tierlist-1",
        "auth0|owner",
        body,
      );

      expect(service.updateSettings).toHaveBeenCalledWith(
        "tierlist-1",
        "auth0|owner",
        body,
      );
      expect(result).toBe(response);
    });
  });
});
