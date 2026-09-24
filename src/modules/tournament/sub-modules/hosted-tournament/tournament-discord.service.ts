import { generateSlug } from "@core/slug";
import { DiscordService } from "@modules/discord/discord.service";
import { DraftRepository } from "@modules/draft/draft.repository";
import { assertCan } from "@modules/tournament/tournament-policy";
import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { hashInviteToken } from "./tournament-organizer.service";

export const DISCORD_LINK_CODE_TTL_MS = 15 * 60 * 1000;
const DISCORD_LINK_CODE_LENGTH = 12;

export const DRAFTZONE_COMMAND = new SlashCommandBuilder()
  .setName("draftzone")
  .setDescription("DraftZone tournament tools")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((link) =>
    link
      .setName("link")
      .setDescription("Link this server to a DraftZone tournament")
      .addStringOption((code) =>
        code
          .setName("code")
          .setDescription("The code from the tournament's Discord settings")
          .setRequired(true),
      ),
  )
  .toJSON();

@Injectable()
export class TournamentDiscordService implements OnModuleInit {
  constructor(
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly draftRepo: DraftRepository,
    private readonly discordService: DiscordService,
  ) {}

  onModuleInit() {
    this.discordService.registerCommand(DRAFTZONE_COMMAND, (interaction) =>
      this.handleCommand(interaction),
    );
  }

  async createLinkCode(leagueSlug: string, tournamentSlug: string, sub: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSettings");

    const code = generateSlug(DISCORD_LINK_CODE_LENGTH);
    const expiresAt = new Date(Date.now() + DISCORD_LINK_CODE_TTL_MS);
    await this.tournamentRepo.setDiscordLinkCode(tournament.id, {
      hash: hashInviteToken(code),
      expiresAt,
      createdBy: sub,
    });

    return { code, expiresAt, command: `/draftzone link code:${code}` };
  }

  async unlink(leagueSlug: string, tournamentSlug: string, sub: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSettings");

    await this.tournamentRepo.unlinkDiscord(tournament.id);
    await this.draftRepo.clearChannelsByTournament(tournament.id);
    return { success: true };
  }

  async handleCommand(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand(false) !== "link") return;

    if (!interaction.inGuild() || !interaction.guildId)
      return this.reply(
        interaction,
        "Run this inside the Discord server you want to link.",
      );

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
      return this.reply(
        interaction,
        "You need the Manage Server permission to link this server.",
      );

    const code = interaction.options.getString("code", true).trim();
    const guildId = interaction.guildId;
    const guildName = interaction.guild?.name ?? guildId;

    const linked = await this.tournamentRepo.consumeDiscordLinkCode(
      hashInviteToken(code),
      { guildId, guildName, linkedBy: interaction.user.id },
    );
    if (!linked)
      return this.reply(
        interaction,
        "That code is invalid or has expired. Get a new one from the tournament's Discord settings.",
      );

    if (linked.previousGuildId && linked.previousGuildId !== guildId) {
      await this.tournamentRepo.clearDiscordTargets(linked.tournamentId);
      await this.draftRepo.clearChannelsByTournament(linked.tournamentId);
    }

    return this.reply(
      interaction,
      `Linked **${guildName}** to **${linked.tournamentName}**. Choose the coach role and channels in the tournament's settings.`,
    );
  }

  private async reply(interaction: ChatInputCommandInteraction, content: string) {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
