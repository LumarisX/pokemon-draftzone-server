import type { DiscordService } from "@modules/discord/discord.service";
import { ErrorReportDto } from "./error-report.dto";
import { ErrorReportService } from "./error-report.service";

const CHANNEL_ID = "1520852048718074036";

function buildDiscord(overrides: Partial<DiscordService> = {}): DiscordService {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    sendMessage: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as DiscordService;
}

describe("ErrorReportService", () => {
  it("does not send when Discord is disabled", async () => {
    const discord = buildDiscord({
      isEnabled: jest.fn().mockReturnValue(false),
    });
    const service = new ErrorReportService(discord);

    const delivered = await service.submit({ message: "boom" });

    expect(delivered).toBe(false);
    expect(discord.sendMessage).not.toHaveBeenCalled();
  });

  it("sends an embed to the error-report channel", async () => {
    const discord = buildDiscord();
    const service = new ErrorReportService(discord);

    const dto: ErrorReportDto = {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Something failed",
      url: "/api/draft",
      details: { field: "name", reason: "required" },
      requestId: "req-123",
      pageUrl: "https://pokemondraftzone.com/drafts",
      userAgent: "jest",
    };

    const delivered = await service.submit(dto, "auth0|abc123");

    expect(delivered).toBe(true);
    expect(discord.sendMessage).toHaveBeenCalledTimes(1);
    const [channelId, payload] = (discord.sendMessage as jest.Mock).mock
      .calls[0];
    expect(channelId).toBe(CHANNEL_ID);
    expect(payload.embeds).toHaveLength(1);

    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toContain("500");
    expect(embed.title).toContain("INTERNAL_ERROR");
    expect(embed.description).toBe("Something failed");
    const fieldNames = embed.fields.map((f: { name: string }) => f.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "User",
        "Request URL",
        "Page",
        "Request ID",
        "Details",
      ]),
    );
    const userField = embed.fields.find(
      (f: { name: string }) => f.name === "User",
    );
    expect(userField.value).toBe("auth0|abc123");
  });

  it("marks the user as logged out when no sub is provided", async () => {
    const discord = buildDiscord();
    const service = new ErrorReportService(discord);

    await service.submit({ message: "boom" });

    const embed = (
      discord.sendMessage as jest.Mock
    ).mock.calls[0][1].embeds[0].toJSON();
    const userField = embed.fields.find(
      (f: { name: string }) => f.name === "User",
    );
    expect(userField.value).toBe("Logged out");
  });

  it("clamps oversized fields to Discord's limits", async () => {
    const discord = buildDiscord();
    const service = new ErrorReportService(discord);

    const delivered = await service.submit({
      message: "x".repeat(10_000),
      stack: "y".repeat(10_000),
    });

    expect(delivered).toBe(true);
    const embed = (
      discord.sendMessage as jest.Mock
    ).mock.calls[0][1].embeds[0].toJSON();
    expect(embed.description.length).toBeLessThanOrEqual(4096);
    const stackField = embed.fields.find(
      (f: { name: string }) => f.name === "Stack Trace",
    );
    expect(stackField.value.length).toBeLessThanOrEqual(1024);
  });
});
