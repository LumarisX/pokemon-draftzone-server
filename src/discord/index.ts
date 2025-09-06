import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Interaction,
  type Message,
} from "discord.js";
import OpenAi from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type winston from "winston";
import { config } from "../config";
import { routes } from "./commands";
import { deployGuildCommands } from "./deploy-commands";
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});
type Forme = "Normal" | "Attack" | "Defense" | "Speed";
const FORMES: Record<Forme, number> = {
  Normal: 0,
  Attack: 1,
  Defense: 2,
  Speed: 3,
};
const forme: Forme = "Attack";
const openai = new OpenAi({
  apiKey: config.OPENAI_API_KEY,
});

/**
 * Starts and initializes the Discord bot.
 * @param logger - The Winston logger instance.
 * @returns The initialized Discord client instance or undefined if disabled/misconfigured.
 */
export async function startDiscordBot(
  logger: winston.Logger
): Promise<Client | undefined> {
  if (
    !config.DISCORD_TOKEN ||
    !config.OPENAI_API_KEY ||
    (config.DISCORD_DISABLED && config.DISCORD_DISABLED === "true")
  ) {
    logger.warn(
      "Discord bot is disabled or missing necessary configuration (DISCORD_TOKEN, OPENAI_API_KEY)."
    );
    return undefined;
  }

  client.once("ready", () => {
    if (client.user) {
      logger.info(`Discord bot ready! Logged in as ${client.user.tag}`);
    } else {
      logger.error(
        "Discord client ready event fired, but client.user is null."
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
    if (!interaction.isCommand() && !interaction.isAutocomplete()) return;

    const commandData = routes
      .filter((route) => route.enabled)
      .flatMap((routes) => routes.commands)
      .filter((commandData) => commandData.enabled)
      .find(
        (commandData) =>
          commandData.command.data.name.toLowerCase() ===
          interaction.commandName.toLowerCase()
      );

    if (!commandData) {
      logger.warn(
        `Command not found for interaction: ${interaction.commandName}`
      );
      return;
    }

    if (interaction.isAutocomplete() && commandData.command.autocomplete) {
      try {
        await commandData.command.autocomplete(interaction);
      } catch (autoCompleteError) {
        logger.error(
          `Error during autocomplete for ${interaction.commandName}:`,
          autoCompleteError
        );
      }
    } else if (interaction.isChatInputCommand()) {
      try {
        const optionsString = interaction.options.data
          .map((option) => `${option.name}:${option.value}`)
          .join(" ");
        logger.info(
          `Interaction | User: ${interaction.user.tag} (${interaction.user.id}) | Command: /${interaction.commandName} ${optionsString}`
        );

        await commandData.command.execute(interaction);
      } catch (error) {
        logger.error(
          `Error executing command /${interaction.commandName} for user ${interaction.user.tag}:`,
          error
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

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot || message.mentions.everyone || !client.user) return;

    if (
      message.content.toLowerCase().includes("deoxys") ||
      message.mentions.has(client.user.id)
    ) {
      logger.info(
        `Message Mention | Author: ${message.author.tag} (${message.author.id}) | Content: ${message.content}`
      );
      gptRespond(message, logger);
    }
  });

  try {
    await client.login(config.DISCORD_TOKEN);
    logger.info("Discord client login successful.");
    return client;
  } catch (error) {
    logger.error("Failed to connect to Discord:", error);
    throw new Error(
      `Discord login failed: ${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * Generates a response using OpenAI based on message context.
 * @param message - The Discord message object.
 * @param logger - The Winston logger instance.
 */
async function gptRespond(message: Message, logger: winston.Logger) {
  if (!client.user) {
    logger.error("gptRespond called but client.user is null.");
    return;
  }
  try {
    const basePrompt: ChatCompletionMessageParam = {
      role: "system",
      content: `You are the Pokémon Deoxys from outer space... Only user messages are in the form of {User's Name}: {Message}, assistant messages are in the form {Emotion}: {Message}. Emotions are only the following: Angry, Crying, Determined, Dizzy, Happy, Inspire, Joyous, Normal, Pain, Power-Up, Sad, Shouting, Sigh, Stunned, Surprised, Teary-Eyed, and Worried. If you need special characters, use markdown format.`,
    };

    let conversationHistory: ChatCompletionMessageParam[] = [];
    let referencedMessage: Message | null = message;
    for (let i = 10; i > 0 && referencedMessage; i--) {
      conversationHistory.unshift({
        role:
          referencedMessage.author.id === client.user.id ? "assistant" : "user",
        content:
          referencedMessage.author.id === client.user.id &&
          referencedMessage.embeds.length > 0
            ? `${referencedMessage.embeds[0].description}`
            : `${referencedMessage.author.displayName}: ${referencedMessage.content}`,
      });

      if (referencedMessage.reference?.messageId) {
        try {
          referencedMessage = await message.channel.messages.fetch(
            referencedMessage.reference.messageId
          );
        } catch (fetchError) {
          logger.warn("Could not fetch referenced message:", fetchError);
          referencedMessage = null;
        }
      } else {
        referencedMessage = null;
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [basePrompt, ...conversationHistory],
    });

    let rawReply = completion.choices[0]?.message?.content;
    if (!rawReply) {
      logger.warn("OpenAI completion returned empty content.");
      rawReply = "Normal: I have nothing to say to that.";
    }

    logger.info(`DeoxysGPT Response | ${rawReply}`);

    let emotion = "Normal"; // Default emotion
    let replyString = rawReply;

    const emotionMatch = rawReply.match(/^([\w -]+):\s*(.*)$/s);

    if (emotionMatch) {
      const potentialEmotion = emotionMatch[1]
        .trim()
        .toLowerCase()
        .replace(/\s/g, "");
      let parsedEmotion: string | undefined;

      switch (potentialEmotion) {
        case "angry":
        case "crying":
        case "determined":
        case "dizzy":
        case "happy":
        case "inspire":
        case "joyous":
        case "normal":
        case "pain":
        case "sad":
        case "shouting":
        case "sigh":
        case "stunned":
        case "surprised":
          parsedEmotion =
            potentialEmotion.charAt(0).toUpperCase() +
            potentialEmotion.substring(1);
          break;
        case "tearyeyed":
          parsedEmotion = "Teary-Eyed";
          break;
        case "powerup":
          parsedEmotion = "Special1";
          break;
      }

      if (parsedEmotion) {
        emotion = parsedEmotion;
        replyString = emotionMatch[2].trim();
      }
    }

    if (!replyString?.trim()) {
      replyString = "I am unsure how to respond.";
    }

    const emotionUrl = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/0386${
      FORMES[forme] > 0 ? "/000" + FORMES[forme] : ""
    }/${emotion}.png`;

    const responseEmbed = new EmbedBuilder()
      .setThumbnail(emotionUrl)
      .setDescription(replyString);

    await message.reply({
      allowedMentions: { repliedUser: false },
      embeds: [responseEmbed],
    });
  } catch (error) {
    logger.error("Error in gptRespond:", error);
    try {
      await message.reply({
        content: "Sorry, I encountered an error trying to process that.",
        allowedMentions: { repliedUser: false },
      });
    } catch (replyError) {
      logger.error("Failed to send error reply to user:", replyError);
    }
  }
}
