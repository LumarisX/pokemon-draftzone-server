import { Types } from "mongoose";
import { DiscordService } from "@modules/discord/discord.service";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";
import { ExternalTournamentAdRepository } from "./external-tournament-ad.repository";
import { ExternalTournamentAdService } from "./external-tournament-ad.service";

function buildDto(): ExternalTournamentAdDto {
  return {
    leagueName: "Spring League",
    description: "A friendly league",
    skillLevelRange: { from: "0", to: "1" },
    prizeValue: 2,
    platforms: ["Pokémon Showdown"],
    formats: ["Singles"],
    rulesets: ["Gen9 NatDex"],
    signupLink: "https://example.com/signup",
    closesAt: new Date("2026-02-01"),
  } as ExternalTournamentAdDto;
}

describe("ExternalTournamentAdService", () => {
  let repo: jest.Mocked<ExternalTournamentAdRepository>;
  let discord: jest.Mocked<DiscordService>;
  let service: ExternalTournamentAdService;

  beforeEach(() => {
    repo = {
      getOpenTournamentAds: jest.fn(),
      getMyTournamentAds: jest.fn(),
      createTournamentAd: jest.fn(),
      deleteTournamentAd: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<ExternalTournamentAdRepository>;
    discord = {
      isEnabled: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn().mockResolvedValue(true),
      registerButtonHandler: jest.fn(),
    } as unknown as jest.Mocked<DiscordService>;
    service = new ExternalTournamentAdService(repo, discord);
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

  describe("createExternalTournamentAd", () => {
    it("persists the ad as Pending and posts a review message with approve/deny buttons", async () => {
      const adId = new Types.ObjectId().toString();
      repo.createTournamentAd.mockImplementation(async (ad) => {
        ad._id = adId;
        return ad;
      });

      const created = await service.createExternalTournamentAd(
        buildDto(),
        "auth0|owner",
      );

      expect(repo.createTournamentAd).toHaveBeenCalledWith(
        expect.objectContaining({ owner: "auth0|owner", status: "Pending" }),
      );
      expect(created.status).toBe("Pending");

      expect(discord.sendMessage).toHaveBeenCalledTimes(1);
      const [channelId, payload] = discord.sendMessage.mock.calls[0];
      expect(channelId).toBe("1293333149471871108");
      expect(payload.components).toHaveLength(1);
      const buttons = payload.components![0].components.map((c) => c.toJSON());
      expect(buttons).toEqual([
        expect.objectContaining({ custom_id: `league-ad:approve:${adId}` }),
        expect.objectContaining({ custom_id: `league-ad:deny:${adId}` }),
      ]);
    });

    it("still creates the ad when the Discord integration is disabled", async () => {
      discord.isEnabled.mockReturnValue(false);
      repo.createTournamentAd.mockImplementation(async (ad) => ad);

      const created = await service.createExternalTournamentAd(
        buildDto(),
        "auth0|owner",
      );

      expect(created.status).toBe("Pending");
      expect(discord.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("review buttons", () => {
    function getRegisteredHandler() {
      service.onModuleInit();
      expect(discord.registerButtonHandler).toHaveBeenCalledWith(
        "league-ad",
        expect.any(Function),
      );
      return discord.registerButtonHandler.mock.calls[0][1];
    }

    function buildInteraction() {
      return {
        message: { embeds: [] },
        update: jest.fn(),
        reply: jest.fn(),
      } as any;
    }

    it("approves the ad and disables the buttons on the message", async () => {
      const adId = new Types.ObjectId().toString();
      repo.updateStatus.mockResolvedValue({ _id: adId } as any);
      const handler = getRegisteredHandler();
      const interaction = buildInteraction();

      await handler("approve", adId, interaction);

      expect(repo.updateStatus).toHaveBeenCalledWith(adId, "Approved");
      expect(interaction.update).toHaveBeenCalledTimes(1);
      const update = interaction.update.mock.calls[0][0];
      const buttons = update.components[0].components.map((c: any) =>
        c.toJSON(),
      );
      expect(buttons.every((b: any) => b.disabled)).toBe(true);
    });

    it("denies the ad when the deny button is clicked", async () => {
      const adId = new Types.ObjectId().toString();
      repo.updateStatus.mockResolvedValue({ _id: adId } as any);
      const handler = getRegisteredHandler();

      await handler("deny", adId, buildInteraction());

      expect(repo.updateStatus).toHaveBeenCalledWith(adId, "Denied");
    });

    it("replies ephemerally when the ad no longer exists", async () => {
      const adId = new Types.ObjectId().toString();
      repo.updateStatus.mockResolvedValue(null);
      const handler = getRegisteredHandler();
      const interaction = buildInteraction();

      await handler("approve", adId, interaction);

      expect(interaction.update).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: "This league ad no longer exists." }),
      );
    });

    it("ignores unknown actions", async () => {
      const handler = getRegisteredHandler();
      const interaction = buildInteraction();

      await handler("snooze", new Types.ObjectId().toString(), interaction);

      expect(repo.updateStatus).not.toHaveBeenCalled();
      expect(interaction.update).not.toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  describe("deleteExternalTournamentAd", () => {
    it("deletes the ad scoped to the owner", async () => {
      const adId = new Types.ObjectId().toString();
      repo.deleteTournamentAd.mockResolvedValue(1);

      await service.deleteExternalTournamentAd(adId, "auth0|owner");

      expect(repo.deleteTournamentAd).toHaveBeenCalledWith(adId, "auth0|owner");
    });

    it("throws NOT_FOUND when nothing was deleted", async () => {
      const adId = new Types.ObjectId().toString();
      repo.deleteTournamentAd.mockResolvedValue(0);

      await expect(
        service.deleteExternalTournamentAd(adId, "auth0|owner"),
      ).rejects.toMatchObject({ code: "LR-AD-001" });
    });

    it("throws NOT_FOUND for a malformed id without querying", async () => {
      await expect(
        service.deleteExternalTournamentAd("not-an-id", "auth0|owner"),
      ).rejects.toMatchObject({ code: "LR-AD-001" });
      expect(repo.deleteTournamentAd).not.toHaveBeenCalled();
    });
  });
});
