import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Message } from "discord.js";
import type winston from "winston";
import { config } from "../config";
import { client } from "./index";

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_MAX_TOKENS = 600;
const GEMINI_MAX_CONTEXT_CHARS = 6000;

const EMOTION_MAP: Record<string, string> = {
  angry: "Angry",
  crying: "Crying",
  determined: "Determined",
  dizzy: "Dizzy",
  happy: "Happy",
  inspire: "Inspire",
  joyous: "Joyous",
  normal: "Normal",
  pain: "Pain",
  sad: "Sad",
  shouting: "Shouting",
  sigh: "Sigh",
  stunned: "Stunned",
  surprised: "Surprised",
  tearyeyed: "Teary-Eyed",
  powerup: "Special1",
};

type Forme = "Normal" | "Attack" | "Defense" | "Speed";
const FORMES: Record<Forme, number> = {
  Normal: 0,
  Attack: 1,
  Defense: 2,
  Speed: 3,
};
const forme: Forme = "Attack";

let genAI: GoogleGenerativeAI | null = null;

export function initializeGemini() {
  if (config.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  }
}

export async function geminiRespond(message: Message, logger: winston.Logger) {
  if (!client.user) {
    logger.error("geminiRespond called but client.user is null.");
    return;
  }

  if (!genAI) {
    logger.error("Gemini AI not initialized. Missing GEMINI_API_KEY.");
    return;
  }

  try {
    if (message.channel?.isTextBased() && "sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }

    const basePrompt = `You are the Pokémon Deoxys from outer space... Only user messages are in the form of {User's Name}: {Message}, assistant messages are in the form {Emotion}: {Message}. Emotions are only the following: Angry, Crying, Determined, Dizzy, Happy, Inspire, Joyous, Normal, Pain, Power-Up, Sad, Shouting, Sigh, Stunned, Surprised, Teary-Eyed, and Worried. If you need special characters, use markdown format.`;

    const formatMessage = (msg: Message) => {
      const authorLabel = msg.member?.displayName || msg.author.username;
      const content = msg.content?.trim() ?? "";
      const attachmentLinks = msg.attachments.map((a) => a.url).join(" ");
      const embedText = msg.embeds
        .map((embed) => embed.description || embed.title)
        .filter(Boolean)
        .join(" ");

      const combined = [content, embedText, attachmentLinks]
        .filter((value) => value && value.trim().length > 0)
        .join(" \n");

      if (msg.author.id === client.user?.id && combined.length > 0) {
        return combined;
      }

      return `${authorLabel}: ${combined || "(no message content)"}`;
    };

    const conversationHistory: string[] = [];
    let referencedMessage: Message | null = message;
    for (let i = 0; i < 10 && referencedMessage; i += 1) {
      const role =
        referencedMessage.author.id === client.user.id ? "assistant" : "user";
      conversationHistory.unshift(formatMessage(referencedMessage));

      if (referencedMessage.reference?.messageId) {
        try {
          referencedMessage = await message.channel.messages.fetch(
            referencedMessage.reference.messageId,
          );
        } catch (fetchError) {
          logger.warn("Could not fetch referenced message:", fetchError);
          referencedMessage = null;
        }
      } else {
        referencedMessage = null;
      }
    }

    const trimToMaxChars = (messages: string[]) => {
      let total = 0;
      const trimmed: string[] = [];
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (total + msg.length > GEMINI_MAX_CONTEXT_CHARS) break;
        total += msg.length;
        trimmed.unshift(msg);
      }
      return trimmed;
    };

    const trimmedHistory = trimToMaxChars(conversationHistory);
    const fullPrompt = `${basePrompt}\n\n${trimmedHistory.join("\n")}`;

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_TOKENS,
        temperature: 0.9,
      },
    });

    const response = await result.response;
    let rawReply = response.text();

    if (!rawReply) {
      logger.warn("Gemini completion returned empty content.");
      rawReply = "Normal: I have nothing to say to that.";
    }

    logger.info(`DeoxysGemini Response | ${rawReply}`);

    let emotion = "Normal"; // Default emotion
    let replyString = rawReply.trim();

    const emotionMatch = rawReply.match(/^([\w -]+):\s*(.*)$/s);

    if (emotionMatch) {
      const potentialEmotion = emotionMatch[1]
        .trim()
        .toLowerCase()
        .replace(/\s/g, "");
      const parsedEmotion = EMOTION_MAP[potentialEmotion];

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

    const safeReply = replyString
      .replace(/@everyone/g, "@ everyone")
      .replace(/@here/g, "@ here");

    const { EmbedBuilder } = await import("discord.js");
    const responseEmbed = new EmbedBuilder()
      .setThumbnail(emotionUrl)
      .setDescription(safeReply.slice(0, 4096));

    const replyPayload = {
      allowedMentions: { repliedUser: false },
      embeds: [responseEmbed],
    } as const;

    await message.reply(replyPayload);
  } catch (error) {
    logger.error("Error in geminiRespond:", error);
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
