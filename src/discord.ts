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
