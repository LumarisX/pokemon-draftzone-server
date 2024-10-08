import { Client, GatewayIntentBits } from "discord.js";
import { config } from "./config";

export function startDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessages,
    ],
  });

  client.once("ready", () => console.log("Deoxys has been summoned!"));

  client.login(config.DISCORD_TOKEN);

  return client;
}
