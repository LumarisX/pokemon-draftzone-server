import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Guild,
  GuildMember,
  Interaction,
  MessageFlags,
  PermissionFlagsBits,
  Role,
} from "discord.js";
import { DISCORD_CLIENT } from "./discord.constants";

export type DiscordMemberSummary = {
  id: string;
  roleIds: string[];
};

type SendMessagePayload = {
  content?: string;
  embeds?: EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
};

export type DiscordButtonHandler = (
  action: string,
  targetId: string,
  interaction: ButtonInteraction,
) => Promise<void>;

export type DiscordCommandHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

type MemberIndex = Map<string, DiscordMemberSummary>;

export type DiscordTargets = {
  guildId?: string;
  roleId?: string;
  channelIds?: (string | undefined)[];
};

const PRIVILEGED_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.MentionEveryone,
];

const MEMBER_INDEX_TTL_MS = 60_000;
const MENTION_PATTERN = /^<@!?(\d{17,20})>$/;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  private ready = false;

  private readonly memberIndexCache = new Map<
    string,
    { expiresAt: number; index: MemberIndex }
  >();
  private readonly pendingIndexFetches = new Map<
    string,
    Promise<MemberIndex | null>
  >();

  private readonly buttonHandlers = new Map<string, DiscordButtonHandler>();
  private readonly commandHandlers = new Map<string, DiscordCommandHandler>();
  private interactionListenerAttached = false;

  constructor(
    @Inject(DISCORD_CLIENT) private readonly client: Client,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>("DISCORD_TOKEN");
    const disabled = this.configService.get<string>("DISCORD_DISABLED");

    if (!token || disabled === "true") {
      this.logger.warn(
        "Discord integration disabled (missing DISCORD_TOKEN or DISCORD_DISABLED=true).",
      );
      return;
    }

    try {
      await this.client.login(token);
      this.ready = true;
      this.logger.log("Discord client connected.");
    } catch (error) {
      this.logger.warn("Failed to connect Discord client.", error);
    }
  }

  async onModuleDestroy() {
    if (this.ready) {
      await this.client.destroy();
    }
  }

  isEnabled(): boolean {
    return this.ready && this.client.isReady();
  }

  async findMember(
    guildId: string,
    discordName?: string,
  ): Promise<DiscordMemberSummary | null> {
    const trimmed = discordName?.trim();
    if (!trimmed || !this.isEnabled()) return null;

    const index = await this.getMemberIndex(guildId);
    return index
      ? this.findInIndex(index, trimmed)
      : this.findLive(guildId, trimmed);
  }

  async grantRole(
    guildId: string,
    memberId: string,
    roleId: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId);
      const refusal = role
        ? await this.roleRefusal(guild, role)
        : "the role does not exist";
      if (refusal) {
        this.logger.warn(
          `Refused to grant role ${roleId} in guild ${guildId}: ${refusal}`,
        );
        return false;
      }
      const member = await guild.members.fetch(memberId);
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to grant role ${roleId} to member ${memberId} in guild ${guildId}`,
        error,
      );
      return false;
    }
  }

  async findTargetProblems(targets: DiscordTargets): Promise<string[]> {
    const channelIds = (targets.channelIds ?? []).filter(
      (channelId): channelId is string => Boolean(channelId),
    );

    if (!targets.guildId)
      return targets.roleId || channelIds.length
        ? ["Set the Discord server before choosing a role or channel."]
        : [];

    if (!this.isEnabled()) return [];

    const guild = await this.client.guilds
      .fetch(targets.guildId)
      .catch(() => null);
    if (!guild) return ["The DraftZone bot is not in that Discord server."];

    const problems: string[] = [];

    if (targets.roleId) {
      const role = await guild.roles.fetch(targets.roleId).catch(() => null);
      const refusal = role
        ? await this.roleRefusal(guild, role)
        : "it is not a role in that Discord server";
      if (refusal) problems.push(`The coach role can't be used: ${refusal}.`);
    }

    for (const channelId of channelIds) {
      const channel = await this.client.channels
        .fetch(channelId)
        .catch(() => null);
      const channelGuildId =
        channel && "guildId" in channel ? channel.guildId : undefined;
      if (channelGuildId !== guild.id)
        problems.push(`Channel ${channelId} is not in that Discord server.`);
    }

    return problems;
  }

  private async roleRefusal(guild: Guild, role: Role): Promise<string | null> {
    if (role.id === guild.id) return "it is the @everyone role";
    if (role.managed) return "it is managed by an integration";
    if (PRIVILEGED_PERMISSIONS.some((flag) => role.permissions.has(flag)))
      return "it carries moderator or admin permissions";

    const bot = await guild.members.fetchMe().catch(() => null);
    if (!bot || role.position >= bot.roles.highest.position)
      return "the DraftZone bot's role must sit above it";

    return null;
  }

  registerButtonHandler(scope: string, handler: DiscordButtonHandler): void {
    this.buttonHandlers.set(scope, handler);
    this.attachInteractionListener();
  }

  registerCommand(
    definition: RESTPostAPIChatInputApplicationCommandsJSONBody,
    handler: DiscordCommandHandler,
  ): void {
    this.commandHandlers.set(definition.name, handler);
    this.attachInteractionListener();
    if (!this.ready) return;
    if (this.client.isReady()) void this.publishCommand(definition);
    else this.client.once("ready", () => void this.publishCommand(definition));
  }

  private async publishCommand(
    definition: RESTPostAPIChatInputApplicationCommandsJSONBody,
  ): Promise<void> {
    try {
      await this.client.application?.commands.create(definition);
      this.logger.log(`Registered the /${definition.name} command.`);
    } catch (error) {
      this.logger.warn(`Failed to register /${definition.name}`, error);
    }
  }

  private attachInteractionListener(): void {
    if (this.interactionListenerAttached) return;
    this.interactionListenerAttached = true;
    this.client.on("interactionCreate", (interaction) => {
      void this.dispatchInteraction(interaction);
    });
  }

  private async dispatchInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand())
      return this.dispatchCommand(interaction);
    return this.dispatchButtonInteraction(interaction);
  }

  private async dispatchCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const handler = this.commandHandlers.get(interaction.commandName);
    if (!handler) return;
    try {
      await handler(interaction);
    } catch (error) {
      this.logger.warn(`Failed to handle /${interaction.commandName}`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: "Something went wrong. Try again in a moment.",
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    }
  }

  private async dispatchButtonInteraction(
    interaction: Interaction,
  ): Promise<void> {
    if (!interaction.isButton()) return;
    const [scope, action, targetId] = interaction.customId.split(":");
    const handler = this.buttonHandlers.get(scope);
    if (!handler || !action || !targetId) return;
    try {
      await handler(action, targetId, interaction);
    } catch (error) {
      this.logger.warn(
        `Failed to handle button interaction ${interaction.customId}`,
        error,
      );
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: "Failed to process this action.",
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    }
  }

  async sendMessage(
    channelId: string,
    payload: SendMessagePayload,
  ): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !channel.isSendable()) return false;
      await channel.send(payload);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to send message to channel ${channelId}`, error);
      return false;
    }
  }

  /**
   * Resolves a coach's Discord name to a `<@id>` mention, looked up within
   * the guild of the given channel. Falls back to `@name` (or null if no
   * name was given) when the integration is disabled or no match is found.
   */
  async resolveMention(
    channelId: string,
    discordName?: string,
  ): Promise<string | null> {
    const trimmed = discordName?.trim();
    if (!trimmed) return null;

    if (MENTION_PATTERN.test(trimmed)) return trimmed;
    const numericId = trimmed.replace(/^@/, "");
    if (SNOWFLAKE_PATTERN.test(numericId)) return `<@${numericId}>`;

    const fallback = `@${trimmed.replace(/^@/, "")}`;
    if (!this.isEnabled()) return fallback;

    try {
      const channel = await this.client.channels.fetch(channelId);
      const guildId =
        channel && "guild" in channel ? channel.guild?.id : undefined;
      if (!guildId) return fallback;

      const member = await this.findMember(guildId, trimmed);
      return member ? `<@${member.id}>` : fallback;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve mention in channel ${channelId}`,
        error,
      );
      return fallback;
    }
  }

  private async getMemberIndex(guildId: string): Promise<MemberIndex | null> {
    const cached = this.memberIndexCache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) return cached.index;

    const pending = this.pendingIndexFetches.get(guildId);
    if (pending) return pending;

    const fetchPromise = this.buildMemberIndex(guildId).finally(() => {
      this.pendingIndexFetches.delete(guildId);
    });
    this.pendingIndexFetches.set(guildId, fetchPromise);
    return fetchPromise;
  }

  private async buildMemberIndex(guildId: string): Promise<MemberIndex | null> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const members = await guild.members.fetch();
      const index: MemberIndex = new Map();

      for (const member of members.values()) {
        const summary = this.toSummary(member);
        this.addIndexKey(index, member.id, summary);
        this.addIndexKey(index, member.user.username, summary);
        this.addIndexKey(index, member.user.globalName ?? undefined, summary);
        this.addIndexKey(index, member.displayName, summary);
        this.addIndexKey(index, member.user.tag, summary);
        if (member.user.tag?.includes("#")) {
          this.addIndexKey(index, member.user.tag.split("#")[0], summary);
        }
      }

      this.memberIndexCache.set(guildId, {
        expiresAt: Date.now() + MEMBER_INDEX_TTL_MS,
        index,
      });
      return index;
    } catch (error) {
      this.logger.warn(
        `Failed to build member index for guild ${guildId}`,
        error,
      );
      return null;
    }
  }

  private addIndexKey(
    index: MemberIndex,
    key: string | undefined | null,
    summary: DiscordMemberSummary,
  ) {
    if (!key) return;
    const normalized = key.trim().toLowerCase();
    if (normalized) index.set(normalized, summary);
  }

  private findInIndex(
    index: MemberIndex,
    discordName: string,
  ): DiscordMemberSummary | null {
    const mentionMatch = discordName.match(MENTION_PATTERN);
    if (mentionMatch) return index.get(mentionMatch[1]) ?? null;

    const numericId = discordName.replace(/^@/, "");
    if (SNOWFLAKE_PATTERN.test(numericId)) return index.get(numericId) ?? null;

    const normalized = discordName.replace(/^@/, "").trim().toLowerCase();
    const usernameOnly = normalized.includes("#")
      ? normalized.split("#")[0]
      : normalized;

    return index.get(normalized) ?? index.get(usernameOnly) ?? null;
  }

  private async findLive(
    guildId: string,
    discordName: string,
  ): Promise<DiscordMemberSummary | null> {
    try {
      const guild = await this.client.guilds.fetch(guildId);

      const mentionMatch = discordName.match(MENTION_PATTERN);
      const numericId = discordName.replace(/^@/, "");
      if (mentionMatch || SNOWFLAKE_PATTERN.test(numericId)) {
        const member = await guild.members
          .fetch(mentionMatch ? mentionMatch[1] : numericId)
          .catch(() => null);
        return member ? this.toSummary(member) : null;
      }

      const normalized = discordName.replace(/^@/, "").trim().toLowerCase();
      const usernameOnly = normalized.includes("#")
        ? normalized.split("#")[0]
        : normalized;

      const matches = (member: GuildMember) => {
        const username = member.user.username?.toLowerCase();
        const display = member.displayName?.toLowerCase();
        const globalName = member.user.globalName?.toLowerCase();
        const tag = member.user.tag?.toLowerCase();
        return (
          username === normalized ||
          username === usernameOnly ||
          display === normalized ||
          display === usernameOnly ||
          globalName === normalized ||
          globalName === usernameOnly ||
          tag === normalized
        );
      };

      let member = guild.members.cache.find(matches);
      if (!member) {
        const fetched = await guild.members.fetch({
          query: usernameOnly,
          limit: 10,
        });
        member = fetched.find(matches);
      }
      if (!member && normalized !== usernameOnly) {
        const fetched = await guild.members.fetch({
          query: normalized,
          limit: 10,
        });
        member = fetched.find(matches);
      }

      return member ? this.toSummary(member) : null;
    } catch (error) {
      this.logger.warn(`Failed to look up member in guild ${guildId}`, error);
      return null;
    }
  }

  private toSummary(member: GuildMember): DiscordMemberSummary {
    return { id: member.id, roleIds: [...member.roles.cache.keys()] };
  }
}
