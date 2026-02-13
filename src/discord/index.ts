import {
  ActionRowBuilder,
  APIEmbedField,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ColorResolvable,
  EmbedBuilder,
  GatewayIntentBits,
  Interaction,
  type Message,
} from "discord.js";
import type winston from "winston";
import { config } from "../config";
import LeagueCoachModel from "../models/league/coach.model";
import { LeagueAdModel } from "../models/league-ad.model";
import { invalidateLeagueAdsCache } from "../services/league-ad/league-ad-service";
import { routes } from "./commands";
import { deployGuildCommands } from "./deploy-commands";
import { geminiRespond, initializeGemini } from "./gemini";
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

const COACH_ROLE_ID = "1469151649070186576";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function startDiscordBot(
  logger: winston.Logger,
): Promise<Client | undefined> {
  if (
    !config.DISCORD_TOKEN ||
    !config.GEMINI_API_KEY ||
    (config.DISCORD_DISABLED && config.DISCORD_DISABLED === "true")
  ) {
    logger.warn(
      "Discord bot is disabled or missing necessary configuration (DISCORD_TOKEN, GEMINI_API_KEY).",
    );
    return undefined;
  }

  await initializeGemini(logger);

  client.once("clientReady", () => {
    if (client.user) {
      logger.info(`Discord bot ready! Logged in as ${client.user.tag}`);
    } else {
      logger.error(
        "Discord client ready event fired, but client.user is null.",
      );
    }
    try {
      deployGuildCommands({ guildId: `1183936734719922176` });
      logger.info("Guild commands deployment initiated.");
    } catch (deployError) {
      logger.error("Failed to initiate guild command deployment:", deployError);
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isButton()) {
      try {
        const [scope, action, adId] = interaction.customId.split(":");
        if (scope !== "league-ad" || !adId) return;
        if (action !== "approve" && action !== "deny") return;

        const status = action === "approve" ? "Approved" : "Denied";
        const updated = await LeagueAdModel.findByIdAndUpdate(
          adId,
          { status },
          { new: true },
        );

        if (!updated) {
          await interaction.reply({
            content: "This league ad no longer exists.",
            ephemeral: true,
          });
          return;
        }

        invalidateLeagueAdsCache();

        const message = interaction.message;
        const existingEmbed = message.embeds[0];
        const embed = existingEmbed
          ? EmbedBuilder.from(existingEmbed)
          : new EmbedBuilder().setTitle("League Ad Review");

        const fields = embed.data.fields ? [...embed.data.fields] : [];
        const statusIndex = fields.findIndex(
          (field) => field.name === "Status",
        );
        const statusField = { name: "Status", value: status, inline: true };

        if (statusIndex >= 0) {
          fields[statusIndex] = statusField;
        } else {
          fields.unshift(statusField);
        }

        embed.setFields(fields);

        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`league-ad:approve:${adId}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`league-ad:deny:${adId}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
        );

        await interaction.update({
          embeds: [embed],
          components: [disabledRow],
        });
        return;
      } catch (error) {
        logger.warn("Failed to process league ad action:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Failed to update the league ad.",
            ephemeral: true,
          });
        }
        return;
      }
    }

    if (!interaction.isCommand() && !interaction.isAutocomplete()) return;

    const commandData = routes
      .filter((route) => route.enabled)
      .flatMap((routes) => routes.commands)
      .filter((commandData) => commandData.enabled)
      .find(
        (commandData) =>
          commandData.command.data.name.toLowerCase() ===
          interaction.commandName.toLowerCase(),
      );

    if (!commandData) {
      logger.warn(
        `Command not found for interaction: ${interaction.commandName}`,
      );
      return;
    }

    if (interaction.isAutocomplete() && commandData.command.autocomplete) {
      try {
        await commandData.command.autocomplete(interaction);
      } catch (autoCompleteError) {
        logger.error(
          `Error during autocomplete for ${interaction.commandName}:`,
          autoCompleteError,
        );
      }
    } else if (interaction.isChatInputCommand()) {
      try {
        const optionsString = interaction.options.data
          .map((option) => `${option.name}:${option.value}`)
          .join(" ");
        logger.info(
          `Interaction | User: ${interaction.user.tag} (${interaction.user.id}) | Command: /${interaction.commandName} ${optionsString}`,
        );

        await commandData.command.execute(interaction);
      } catch (error) {
        logger.error(
          `Error executing command /${interaction.commandName} for user ${interaction.user.tag}:`,
          error,
        );
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred.";
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: `Error: ${errorMessage}`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `Error: ${errorMessage}`,
            ephemeral: true,
          });
        }
      }
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      const candidates = new Set<string>();
      const username = member.user.username?.trim();
      const displayName = member.displayName?.trim();
      const tag = member.user.tag?.includes("#")
        ? member.user.tag.trim()
        : undefined;

      if (username) candidates.add(username.toLowerCase());
      if (displayName) candidates.add(displayName.toLowerCase());
      if (tag) candidates.add(tag.toLowerCase());

      if (candidates.size === 0) return;

      const patterns = Array.from(candidates).map(
        (value) => new RegExp(`^${escapeRegExp(value)}$`, "i"),
      );

      const coach = await LeagueCoachModel.findOne({
        discordName: { $in: patterns },
      });

      if (!coach) return;

      const role = member.guild.roles.cache.get(COACH_ROLE_ID);
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
      }
    } catch (error) {
      logger.warn("Failed to apply coach role on join:", error);
    }
  });

  client.on("messageCreate", async (message: Message) => {
    if (!client.user) return;
    if (message.author.bot || message.mentions.everyone) return;

    const content = message.content?.trim() ?? "";
    const hasContent = content.length > 0;
    const hasAttachments = message.attachments.size > 0;
    const hasEmbeds = message.embeds.length > 0;

    if (!hasContent && !hasAttachments && !hasEmbeds) return;

    const isMention = message.mentions.has(client.user.id);
    const mentionsName = content.toLowerCase().includes("deoxys");
    let isReplyToBot = false;

    if (message.reference?.messageId) {
      try {
        const referenced = await message.channel.messages.fetch(
          message.reference.messageId,
        );
        isReplyToBot = referenced.author.id === client.user.id;
      } catch (fetchError) {
        logger.warn("Could not fetch referenced message:", fetchError);
      }
    }

    if (isMention || mentionsName || isReplyToBot) {
      logger.info(
        `Message Mention | Author: ${message.author.tag} (${message.author.id}) | Content: ${content}`,
      );
      geminiRespond(message, logger);
    }
  });

  try {
    await client.login(config.DISCORD_TOKEN);
    logger.info("Discord client login successful.");
    return client;
  } catch (error) {
    logger.error("Failed to connect to Discord:", error);
    throw new Error(
      `Discord login failed: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export async function sendDiscordMessage(
  channelId: string,
  options?:
    | {
        content?: string;
        embed?: {
          title?: string;
          description?: string;
          url?: string;
          color?: ColorResolvable;
          fields?: APIEmbedField[];
          image?: string;
        };
      }
    | string,
) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (typeof options === "string") options = { content: options };
    if (
      !(
        channel &&
        (channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.DM)
      )
    ) {
      console.warn(`Channel ${channelId} not found or is not a text channel.`);
      return;
    }

    const embedsToSend = [];

    if (options?.embed) {
      const pokemonEmbed = new EmbedBuilder()
        .setColor(options.embed.color || "#FFDE00")
        .setImage(options.embed.image ?? null)
        .setTimestamp();

      if (options.embed.title) {
        pokemonEmbed.setTitle(options.embed.title);
      }
      if (options.embed.description) {
        pokemonEmbed.setDescription(options.embed.description);
      }
      if (options.embed.url) {
        pokemonEmbed.setURL(options.embed.url);
      }
      if (options.embed.fields && options.embed.fields.length > 0) {
        pokemonEmbed.addFields(options.embed.fields);
      }
      embedsToSend.push(pokemonEmbed);
    }

    if (options?.content || embedsToSend.length > 0) {
      await channel.send({ content: options?.content, embeds: embedsToSend });
      console.log(`Successfully sent message to channel ${channelId}`);
    }
  } catch (error) {
    console.error("Failed to send Discord message with embed:", error);
  }
}

export async function resolveDiscordMention(
  channelId: string,
  discordName?: string,
): Promise<string | null> {
  const trimmed = discordName?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("<@") && trimmed.endsWith(">")) {
    return trimmed;
  }

  const numericId = trimmed.replace(/^@/, "");
  if (/^\d{17,20}$/.test(numericId)) {
    return `<@${numericId}>`;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("guild" in channel) || !channel.guild) {
      return `@${trimmed.replace(/^@/, "")}`;
    }

    const normalized = trimmed.replace(/^@/, "").trim();
    const target = normalized.toLowerCase();
    const targetUsername = normalized.includes("#")
      ? normalized.split("#")[0].toLowerCase()
      : target;

    const matchesMember = (m: {
      user: { username?: string; tag?: string; id: string };
      displayName?: string;
      id: string;
    }) => {
      const username = m.user.username?.toLowerCase();
      const display = m.displayName?.toLowerCase();
      const tag = m.user.tag?.toLowerCase();
      return (
        username === target ||
        username === targetUsername ||
        display === target ||
        display === targetUsername ||
        tag === target
      );
    };

    let member = channel.guild.members.cache.find(matchesMember);
    if (!member) {
      const fetched = await channel.guild.members.fetch({
        query: targetUsername,
        limit: 10,
      });
      member = fetched.find(matchesMember);
    }

    return member ? `<@${member.id}>` : `@${normalized}`;
  } catch (error) {
    console.warn("Failed to resolve Discord mention:", error);
    return `@${trimmed.replace(/^@/, "")}`;
  }
}
