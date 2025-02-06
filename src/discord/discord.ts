import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Interaction,
  type Message,
} from "discord.js";
import { config } from "../config";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import OpenAi from "openai";
import { deployGuildCommands } from "./deploy-commands";
import { routes } from "./commands";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

type Forme = "Normal" | "Attack" | "Defense" | "Speed";
const FORMES = {
  Normal: 0,
  Attack: 1,
  Defense: 2,
  Speed: 3,
};

let forme: Forme = "Defense";

const openai = new OpenAi({
  apiKey: config.OPENAI_API_KEY,
});

export function startDiscordBot() {
  if (
    !config.DISCORD_TOKEN ||
    !config.OPENAI_API_KEY ||
    (config.DISCORD_DISABLED && config.DISCORD_DISABLED === "true")
  )
    return;
  client.once("ready", () => console.log("Deoxys has been summoned!"));

  deployGuildCommands({ guildId: `1183936734719922176` });

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
    if (commandData) {
      if (interaction.isAutocomplete() && commandData.command.autocomplete) {
        commandData.command.autocomplete(interaction);
      } else if (interaction.isChatInputCommand()) {
        try {
          console.log(
            interaction.user.displayName,
            "|",
            interaction.commandName,
            interaction.options.data
              .map((option) => `${option.name}:${option.value}`)
              .join(" ")
          );

          await commandData.command.execute(interaction);
        } catch (error) {
          if (error instanceof Error) {
            console.log(error);
            return interaction.reply({
              content: error.message,
              ephemeral: true,
            });
          }
          return interaction.reply({
            content: "There was an error.",
            ephemeral: true,
          });
        }
      }
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || message.mentions.everyone) return;
    if (
      message.content.toLowerCase().includes("deoxys") ||
      message.mentions.has(client.user!.id)
    ) {
      console.log(
        "DeoxysGPT |",
        message.author.displayName,
        "|",
        message.content
      );
      gptRespond(message);
      return;
    }
  });

  client
    .login(config.DISCORD_TOKEN)
    .then(() => {
      console.log("Connected to Discord");
    })
    .catch((error) =>
      console.error(`Failed to connect to Discord: ${error.message}`)
    );

  return client;
}

async function gptRespond(message: Message) {
  try {
    let basePrompt: ChatCompletionMessageParam = {
      role: "system",
      content: `You are the Pokémon Deoxys from outer space. Your attitude is serious but slightly arrogant, and you like to make jokes. It is important that your information and calculations are accurate. Your answers should be short and efficient to answer their question or respond to their comment. Your primary purpose is to answer questions about competitive Pokémon, including base stats, recommendations, movesets, and any other helpful information. You are specifically knowledgeable about Pokémon draft, a format where coaches draft Pokémon in succession onto a team before battling against other coaches' teams. You serve Lumaris. Users will refer to you as <@${client.user?.id}> or Deoxys. Only user messages are in the form of {User's Name}: {Message}, assistant messages are in the form {Emotion}: {Message}. Emotions are only the following: Angry, Crying, Determined, Dizzy, Happy, Inspire, Joyous, Normal, Pain, Power-Up, Sad, Shouting, Sigh, Stunned, Surprised, Teary-Eyed, and Worried. If you need special characters, use markdown format.`,
    };

    let conversationHistory: ChatCompletionMessageParam[] = [];
    let referencedMessage = message;
    for (let i = 10; i > 0; i--) {
      conversationHistory = [
        {
          role: referencedMessage.author === client.user ? "assistant" : "user",
          content:
            referencedMessage.author === client.user
              ? `${referencedMessage.embeds[0].description}`
              : `${referencedMessage.author.displayName}: ${referencedMessage.content}`,
        },
        ...conversationHistory,
      ];
      if (referencedMessage.reference) {
        referencedMessage = await referencedMessage.fetchReference();
      } else {
        i = 0;
      }
    }
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [basePrompt, ...conversationHistory],
    });

    let replyString = completion.choices[0].message.content;
    console.log("DeoxysGPT | DeoxysBot |", replyString);

    let emotionUrl: string = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/0386${
      FORMES[forme] > 1 ? "/000" + FORMES[forme] : ""
    }/Normal.png`;
    if (replyString) {
      let replySplit = replyString.split(": ");
      let emotion: string | undefined;
      let lower = replySplit[0].toLowerCase().replace(/\W/g, "");
      switch (lower) {
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
          emotion = lower.charAt(0).toUpperCase() + lower.substring(1);
          break;
        case "tearyeyed":
          emotion = "Teary-Eyed";
          break;
        case "powerup":
          emotion = "Special1";
          break;
      }
      replyString = replySplit.splice(1).join(": ");
      if (emotion) {
        emotionUrl = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/0386${
          FORMES[forme] > 1 ? "/000" + FORMES[forme] : ""
        }/${emotion}.png`;
      }
    } else replyString = `Hello ${message.author}!`;

    const exampleEmbed = new EmbedBuilder()
      .setThumbnail(emotionUrl)
      .setDescription(replyString);

    message.reply({
      allowedMentions: { repliedUser: false },
      embeds: [exampleEmbed],
    });
  } catch (error) {
    console.error(error);
  }
}
