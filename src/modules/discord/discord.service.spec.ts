import { ConfigService } from "@nestjs/config";
import type { Client } from "discord.js";
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

function buildGuild(members: ReturnType<typeof buildMember>[]) {
  const cache = {
    find: (predicate: (m: any) => boolean) => members.find(predicate),
  };
  return {
    members: {
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

async function buildEnabledService(members: ReturnType<typeof buildMember>[]) {
  const guild = buildGuild(members);
  const client = {
    login: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    isReady: jest.fn().mockReturnValue(true),
    guilds: { fetch: jest.fn().mockResolvedValue(guild) },
    channels: { fetch: jest.fn() },
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
  });
});
