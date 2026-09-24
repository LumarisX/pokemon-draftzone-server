import { ErrorCodes } from "@core/pdz-error-codes";
import { DiscordService } from "@modules/discord/discord.service";
import { DraftRepository } from "@modules/draft/draft.repository";
import { PermissionFlagsBits } from "discord.js";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  DISCORD_LINK_CODE_TTL_MS,
  DRAFTZONE_COMMAND,
  TournamentDiscordService,
} from "./tournament-discord.service";
import { hashInviteToken } from "./tournament-organizer.service";

const GUILD_ID = "111111111111111111";

function buildInteraction(
  overrides: {
    code?: string;
    inGuild?: boolean;
    canManageServer?: boolean;
  } = {},
) {
  return {
    inGuild: () => overrides.inGuild ?? true,
    guildId: overrides.inGuild === false ? null : GUILD_ID,
    guild: { name: "Kanto League" },
    user: { id: "discord-user-1" },
    memberPermissions: {
      has: (flag: bigint) =>
        flag === PermissionFlagsBits.ManageGuild &&
        (overrides.canManageServer ?? true),
    },
    options: {
      getSubcommand: () => "link",
      getString: () => overrides.code ?? "  code-123  ",
    },
    reply: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe("TournamentDiscordService", () => {
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let discordService: jest.Mocked<DiscordService>;
  let service: TournamentDiscordService;

  beforeEach(() => {
    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue({
        id: "tournament-1",
        owner: "auth0|owner",
        organizers: [],
      }),
      setDiscordLinkCode: jest.fn().mockResolvedValue(undefined),
      consumeDiscordLinkCode: jest.fn(),
      clearDiscordTargets: jest.fn().mockResolvedValue(undefined),
      unlinkDiscord: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    draftRepo = {
      clearChannelsByTournament: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DraftRepository>;
    discordService = {
      registerCommand: jest.fn(),
    } as unknown as jest.Mocked<DiscordService>;
    service = new TournamentDiscordService(
      tournamentRepo,
      draftRepo,
      discordService,
    );
  });

  it("registers /draftzone, limited to Manage Server holders inside a server", () => {
    service.onModuleInit();

    expect(discordService.registerCommand).toHaveBeenCalledWith(
      DRAFTZONE_COMMAND,
      expect.any(Function),
    );
    expect(DRAFTZONE_COMMAND.default_member_permissions).toBe(
      PermissionFlagsBits.ManageGuild.toString(),
    );
    expect(DRAFTZONE_COMMAND.contexts).toEqual([0]);
  });

  describe("createLinkCode", () => {
    it("refuses a non-organizer", async () => {
      await expect(
        service.createLinkCode("league", "tournament", "auth0|stranger"),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
      expect(tournamentRepo.setDiscordLinkCode).not.toHaveBeenCalled();
    });

    it("stores only the code's hash, with a short expiry", async () => {
      const before = Date.now();
      const result = await service.createLinkCode(
        "league",
        "tournament",
        "auth0|owner",
      );

      expect(result.command).toBe(`/draftzone link code:${result.code}`);
      const [, stored] = tournamentRepo.setDiscordLinkCode.mock.calls[0];
      expect(stored.hash).toBe(hashInviteToken(result.code));
      expect(stored.hash).not.toContain(result.code);
      expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + DISCORD_LINK_CODE_TTL_MS,
      );
    });
  });

  describe("unlink", () => {
    it("clears the server link and every pool's channel", async () => {
      await service.unlink("league", "tournament", "auth0|owner");

      expect(tournamentRepo.unlinkDiscord).toHaveBeenCalledWith("tournament-1");
      expect(draftRepo.clearChannelsByTournament).toHaveBeenCalledWith(
        "tournament-1",
      );
    });

    it("refuses a non-organizer", async () => {
      await expect(
        service.unlink("league", "tournament", "auth0|stranger"),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
      expect(tournamentRepo.unlinkDiscord).not.toHaveBeenCalled();
    });
  });

  describe("/draftzone link", () => {
    it("refuses someone without Manage Server, even if the server's command permissions let them run it", async () => {
      const interaction = buildInteraction({ canManageServer: false });

      await service.handleCommand(interaction);

      expect(tournamentRepo.consumeDiscordLinkCode).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Manage Server"),
        }),
      );
    });

    it("refuses outside a server", async () => {
      const interaction = buildInteraction({ inGuild: false });

      await service.handleCommand(interaction);

      expect(tournamentRepo.consumeDiscordLinkCode).not.toHaveBeenCalled();
    });

    it("reports an invalid or expired code", async () => {
      tournamentRepo.consumeDiscordLinkCode.mockResolvedValue(null);
      const interaction = buildInteraction();

      await service.handleCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("invalid or has expired"),
        }),
      );
    });

    it("links the server the command was run in, by the trimmed code's hash", async () => {
      tournamentRepo.consumeDiscordLinkCode.mockResolvedValue({
        tournamentId: "tournament-1",
        tournamentName: "Spring Cup",
      });
      const interaction = buildInteraction();

      await service.handleCommand(interaction);

      expect(tournamentRepo.consumeDiscordLinkCode).toHaveBeenCalledWith(
        hashInviteToken("code-123"),
        { guildId: GUILD_ID, guildName: "Kanto League", linkedBy: "discord-user-1" },
      );
      expect(tournamentRepo.clearDiscordTargets).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Spring Cup"),
        }),
      );
    });

    it("clears the old server's role and channels when a different server is linked", async () => {
      tournamentRepo.consumeDiscordLinkCode.mockResolvedValue({
        tournamentId: "tournament-1",
        tournamentName: "Spring Cup",
        previousGuildId: "222222222222222222",
      });

      await service.handleCommand(buildInteraction());

      expect(tournamentRepo.clearDiscordTargets).toHaveBeenCalledWith(
        "tournament-1",
      );
      expect(draftRepo.clearChannelsByTournament).toHaveBeenCalledWith(
        "tournament-1",
      );
    });

    it("keeps the role and channels when the same server is re-linked", async () => {
      tournamentRepo.consumeDiscordLinkCode.mockResolvedValue({
        tournamentId: "tournament-1",
        tournamentName: "Spring Cup",
        previousGuildId: GUILD_ID,
      });

      await service.handleCommand(buildInteraction());

      expect(tournamentRepo.clearDiscordTargets).not.toHaveBeenCalled();
    });
  });
});
