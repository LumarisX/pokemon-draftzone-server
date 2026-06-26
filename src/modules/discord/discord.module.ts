import { Module } from "@nestjs/common";
import { Client, GatewayIntentBits } from "discord.js";
import { DISCORD_CLIENT } from "./discord.constants";
import { DiscordService } from "./discord.service";

@Module({
  providers: [
    {
      provide: DISCORD_CLIENT,
      useFactory: () =>
        new Client({
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
        }),
    },
    DiscordService,
  ],
  exports: [DiscordService],
})
export class DiscordModule {}
