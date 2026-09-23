import { ConfigService } from "@nestjs/config";
import { PermissionFlagsBits, type Client } from "discord.js";
import { DiscordService } from "./discord.service";

const GUILD_ID = "guild-1";
const ROLE_ID = "role-1";

function buildMember(overrides: {
  id: string;
  username?: string;
  globalName?: string | null;
  displayName?: string;
  tag?: string;
  roleIds?: string[];
}) {
  const roleIds = overrides.roleIds ?? [];
  return {
    id: overrides.id,
    displayName: overrides.displayName,
    user: {
      username: overrides.username,
      globalName: overrides.globalName ?? null,
      tag: overrides.tag,
    },
    roles: {
      cache: {
        has: (id: string) => roleIds.includes(id),
        keys: () => roleIds[Symbol.iterator](),
      },
      add: jest.fn(),
    },
  } as any;
}

function buildRole(
  overrides: {
    id?: string;
    managed?: boolean;
    position?: number;
    permissions?: bigint[];
  } = {},
) {
  const permissions = overrides.permissions ?? [];
  return {
    id: overrides.id ?? ROLE_ID,
    managed: overrides.managed ?? false,
    position: overrides.position ?? 1,
    permissions: { has: (flag: bigint) => permissions.includes(flag) },
  };
}

function buildGuild(
  members: ReturnType<typeof buildMember>[],
  roles: ReturnType<typeof buildRole>[] = [buildRole()],
) {
  const cache = {
    find: (predicate: (m: any) => boolean) => members.find(predicate),
  };
  return {
    id: GUILD_ID,
    roles: {
      fetch: jest.fn(async (id: string) => roles.find((role) => role.id === id) ?? null),
    },
    members: {
      fetchMe: jest.fn().mockResolvedValue({ roles: { highest: { position: 10 } } }),
      cache,
      fetch: jest.fn((arg?: { query: string; limit: number } | string) => {
        if (typeof arg === "string") {
          const member = members.find((m) => m.id === arg);
          return member
            ? Promise.resolve(member)
            : Promise.reject(new Error("not found"));
        }
        if (arg && "query" in arg) {
          const matches = members.filter((m) =>
            m.user.username?.toLowerCase().includes(arg.query.toLowerCase()),
          );
          return Promise.resolve({
            find: (predicate: (m: any) => boolean) => matches.find(predicate),
          });
        }
        return Promise.resolve({
          values: () => members[Symbol.iterator](),
        });
      }),
    },
  };
}

function buildConfigService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

async function buildEnabledService(
  members: ReturnType<typeof buildMember>[],
  roles?: ReturnType<typeof buildRole>[],
) {
  const guild = buildGuild(members, roles);
  const client = {
    login: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    isReady: jest.fn().mockReturnValue(true),
    guilds: { fetch: jest.fn().mockResolvedValue(guild) },
    channels: { fetch: jest.fn() },
    on: jest.fn(),
    once: jest.fn(),
    application: { commands: { create: jest.fn().mockResolvedValue({}) } },
  } as unknown as jest.Mocked<Client>;

  const service = new DiscordService(
    client,
    buildConfigService({ DISCORD_TOKEN: "token-123" }),
  );
  await service.onModuleInit();
  return { service, client, guild };
}

describe("DiscordService", () => {
  describe("onModuleInit", () => {
    it("stays disabled when DISCORD_TOKEN is missing", async () => {
      const client = {
        login: jest.fn(),
        isReady: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<Client>;
      const service = new DiscordService(client, buildConfigService({}));

      await service.onModuleInit();

      expect(client.login).not.toHaveBeenCalled();
      expect(service.isEnabled()).toBe(false);
    });

    it("stays disabled when DISCORD_DISABLED is 'true'", async () => {
      const client = {
        login: jest.fn(),
        isReady: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<Client>;
      const service = new DiscordService(
        client,
        buildConfigService({
          DISCORD_TOKEN: "token-123",
          DISCORD_DISABLED: "true",
        }),
      );

      await service.onModuleInit();

      expect(client.login).not.toHaveBeenCalled();
      expect(service.isEnabled()).toBe(false);
    });

    it("logs in and becomes enabled when a token is configured", async () => {
      const { service, client } = await buildEnabledService([]);

      expect(client.login).toHaveBeenCalledWith("token-123");
      expect(service.isEnabled()).toBe(true);
    });

    it("stays disabled when login rejects", async () => {
      const client = {
        login: jest.fn().mockRejectedValue(new Error("invalid token")),
        isReady: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<Client>;
      const service = new DiscordService(
        client,
        buildConfigService({ DISCORD_TOKEN: "bad-token" }),
      );

      await service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe("when disabled", () => {
    it("findMember/grantRole/sendMessage are no-ops", async () => {
      const client = {
        login: jest.fn(),
        isReady: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<Client>;
      const service = new DiscordService(client, buildConfigService({}));
      await service.onModuleInit();

      await expect(service.findMember(GUILD_ID, "ash")).resolves.toBeNull();
      await expect(
        service.grantRole(GUILD_ID, "member-1", ROLE_ID),
      ).resolves.toBe(false);
      await expect(
        service.sendMessage("channel-1", { content: "hi" }),
      ).resolves.toBe(false);
    });
  });

  describe("findMember", () => {
    it("matches by username, display name, global name, and tag", async () => {
      const member = buildMember({
        id: "member-1",
        username: "ashk",
        globalName: "Ash Ketchum",
        displayName: "Ash",
        tag: "ashk#1234",
      });
      const { service } = await buildEnabledService([member]);

      await expect(service.findMember(GUILD_ID, "ashk")).resolves.toMatchObject(
        {
          id: "member-1",
        },
      );
      await expect(
        service.findMember(GUILD_ID, "Ash Ketchum"),
      ).resolves.toMatchObject({ id: "member-1" });
      await expect(
        service.findMember(GUILD_ID, "ashk#1234"),
      ).resolves.toMatchObject({ id: "member-1" });
    });

    it("matches by raw snowflake id and mention format", async () => {
      const member = buildMember({
        id: "123456789012345678",
        username: "ashk",
      });
      const { service } = await buildEnabledService([member]);

      await expect(
        service.findMember(GUILD_ID, "123456789012345678"),
      ).resolves.toMatchObject({ id: "123456789012345678" });
      await expect(
        service.findMember(GUILD_ID, "<@123456789012345678>"),
      ).resolves.toMatchObject({ id: "123456789012345678" });
    });

    it("returns null when no member matches", async () => {
      const { service } = await buildEnabledService([
        buildMember({ id: "member-1", username: "someone-else" }),
      ]);

      await expect(service.findMember(GUILD_ID, "ashk")).resolves.toBeNull();
    });

    it("caches the member index per guild and only fetches members once within the TTL", async () => {
      const { service, guild } = await buildEnabledService([
        buildMember({ id: "member-1", username: "ashk" }),
      ]);

      await service.findMember(GUILD_ID, "ashk");
      await service.findMember(GUILD_ID, "ashk");

      expect(guild.members.fetch).toHaveBeenCalledTimes(1);
    });

    it("coalesces concurrent lookups for the same guild into one fetch", async () => {
      const { service, guild } = await buildEnabledService([
        buildMember({ id: "member-1", username: "ashk" }),
        buildMember({ id: "member-2", username: "misty" }),
      ]);

      await Promise.all([
        service.findMember(GUILD_ID, "ashk"),
        service.findMember(GUILD_ID, "misty"),
      ]);

      expect(guild.members.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("grantRole", () => {
    it("adds the role when the member doesn't already have it", async () => {
      const member = buildMember({
        id: "member-1",
        username: "ashk",
        roleIds: [],
      });
      const { service, guild } = await buildEnabledService([member]);
      (guild.members.fetch as jest.Mock).mockResolvedValueOnce(member);

      const result = await service.grantRole(GUILD_ID, "member-1", ROLE_ID);

      expect(result).toBe(true);
      expect(member.roles.add).toHaveBeenCalledWith(ROLE_ID);
    });

    it("is a no-op when the member already has the role", async () => {
      const member = buildMember({
        id: "member-1",
        username: "ashk",
        roleIds: [ROLE_ID],
      });
      const { service, guild } = await buildEnabledService([member]);
      (guild.members.fetch as jest.Mock).mockResolvedValueOnce(member);

      const result = await service.grantRole(GUILD_ID, "member-1", ROLE_ID);

      expect(result).toBe(true);
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it.each([
      ["a role with admin permissions", buildRole({ permissions: [PermissionFlagsBits.Administrator] })],
      ["a role that can manage roles", buildRole({ permissions: [PermissionFlagsBits.ManageRoles] })],
      ["an integration-managed role", buildRole({ managed: true })],
      ["the @everyone role", buildRole({ id: GUILD_ID })],
      ["a role above the bot", buildRole({ position: 10 })],
    ])("refuses %s", async (_label, role) => {
      const member = buildMember({ id: "member-1", roleIds: [] });
      const { service } = await buildEnabledService([member], [role]);

      const result = await service.grantRole(GUILD_ID, "member-1", role.id);

      expect(result).toBe(false);
      expect(member.roles.add).not.toHaveBeenCalled();
    });
  });

  describe("registerCommand", () => {
    const definition = { name: "draftzone", description: "tools" } as any;

    function chatInput(commandName: string) {
      return {
        isChatInputCommand: () => true,
        isButton: () => false,
        commandName,
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined),
      };
    }

    it("publishes the command once the bot is ready", async () => {
      const { service, client } = await buildEnabledService([]);

      service.registerCommand(definition, jest.fn());

      expect(client.application!.commands.create).toHaveBeenCalledWith(
        definition,
      );
    });

    it("routes a slash command to its handler", async () => {
      const { service, client } = await buildEnabledService([]);
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerCommand(definition, handler);
      const listener = (client.on as jest.Mock).mock.calls.find(
        ([event]) => event === "interactionCreate",
      )[1];

      const interaction = chatInput("draftzone");
      await listener(interaction);
      await new Promise((resolve) => setImmediate(resolve));

      expect(handler).toHaveBeenCalledWith(interaction);
    });

    it("replies privately when a handler throws", async () => {
      const { service, client } = await buildEnabledService([]);
      service.registerCommand(
        definition,
        jest.fn().mockRejectedValue(new Error("boom")),
      );
      const listener = (client.on as jest.Mock).mock.calls.find(
        ([event]) => event === "interactionCreate",
      )[1];

      const interaction = chatInput("draftzone");
      await listener(interaction);
      await new Promise((resolve) => setImmediate(resolve));

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ flags: expect.anything() }),
      );
    });

    it("does not publish when the integration is disabled", async () => {
      const client = {
        on: jest.fn(),
        once: jest.fn(),
        application: { commands: { create: jest.fn() } },
      } as unknown as jest.Mocked<Client>;
      const service = new DiscordService(client, buildConfigService({}));
      await service.onModuleInit();

      service.registerCommand(definition, jest.fn());

      expect(client.application!.commands.create).not.toHaveBeenCalled();
    });
  });

  describe("findTargetProblems", () => {
    it("accepts a plain role and a channel in the configured server", async () => {
      const { service, client } = await buildEnabledService([]);
      (client.channels.fetch as jest.Mock).mockResolvedValue({ guildId: GUILD_ID });

      await expect(
        service.findTargetProblems({
          guildId: GUILD_ID,
          roleId: ROLE_ID,
          channelIds: ["channel-1"],
        }),
      ).resolves.toEqual([]);
    });

    it("rejects a channel from another server", async () => {
      const { service, client } = await buildEnabledService([]);
      (client.channels.fetch as jest.Mock).mockResolvedValue({ guildId: "other-guild" });

      const problems = await service.findTargetProblems({
        guildId: GUILD_ID,
        channelIds: ["channel-1"],
      });

      expect(problems).toEqual([
        "Channel channel-1 is not in that Discord server.",
      ]);
    });

    it("rejects a privileged role", async () => {
      const { service } = await buildEnabledService(
        [],
        [buildRole({ permissions: [PermissionFlagsBits.BanMembers] })],
      );

      const problems = await service.findTargetProblems({
        guildId: GUILD_ID,
        roleId: ROLE_ID,
      });

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("moderator or admin permissions");
    });

    it("rejects a server the bot is not in", async () => {
      const { service, client } = await buildEnabledService([]);
      (client.guilds.fetch as jest.Mock).mockRejectedValue(new Error("Unknown Guild"));

      await expect(
        service.findTargetProblems({ guildId: "elsewhere" }),
      ).resolves.toEqual(["The DraftZone bot is not in that Discord server."]);
    });

    it("requires a server before a role or channel", async () => {
      const { service } = await buildEnabledService([]);

      await expect(
        service.findTargetProblems({ channelIds: ["channel-1"] }),
      ).resolves.toEqual([
        "Set the Discord server before choosing a role or channel.",
      ]);
    });
  });
});
