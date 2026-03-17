import { routes } from "./commands";
import type { Client } from "discord.js";

type DeployCommandsProps = {
  guildId: string;
  client: Client;
};

export async function deployGuildCommands({
  guildId,
  client,
}: DeployCommandsProps) {
  try {
    if (!client.isReady()) {
      console.warn("Discord client is not ready. Skipping command deployment.");
      return;
    }

    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      console.warn(`Guild ${guildId} not found. Skipping command deployment.`);
      return;
    }

    const enabledCommands = routes
      .filter((route) => route.enabled)
      .flatMap((routes) => routes.commands)
      .filter((commandData) => commandData.enabled);

    const commandNames = enabledCommands.map(
      (commandData) => commandData.command.data.name,
    );
    const commandData = enabledCommands.map((commandData) =>
      commandData.command.data.toJSON(),
    );

    console.log("Starting refreshing application (/) commands.");
    console.log(commandNames);
    await guild.commands.set(commandData);
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}
