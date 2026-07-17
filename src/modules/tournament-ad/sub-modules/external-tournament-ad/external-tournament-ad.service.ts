import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Types } from "mongoose";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { DiscordService } from "@modules/discord/discord.service";
import { ExternalTournamentAdRepository } from "./external-tournament-ad.repository";
import { ExternalTournamentAd } from "./external-tournament-ad.domain";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";

const REVIEW_CHANNEL_ID = "1293333149471871108";
const REVIEW_BUTTON_SCOPE = "league-ad";
const FIELD_LIMIT = 1024;

@Injectable()
export class ExternalTournamentAdService implements OnModuleInit {
  private readonly logger = new Logger(ExternalTournamentAdService.name);

  constructor(
    private readonly tournamentAdRepo: ExternalTournamentAdRepository,
    private readonly discordService: DiscordService,
  ) {}

  onModuleInit() {
    this.discordService.registerButtonHandler(
      REVIEW_BUTTON_SCOPE,
      (action, adId, interaction) =>
        this.handleReviewAction(action, adId, interaction),
    );
  }

  async getExternalTournamentAds() {
    const tournamentAds = await this.tournamentAdRepo.getOpenTournamentAds();
    return tournamentAds;
  }

  async getMyExternalTournamentAds(owner: string) {
    const tournamentAds = await this.tournamentAdRepo.getMyTournamentAds(owner);
    return tournamentAds;
  }

  async createExternalTournamentAd(
    dto: ExternalTournamentAdDto,
    owner: string,
  ): Promise<ExternalTournamentAd> {
    const tournamentAd = ExternalTournamentAdMapper.fromForm(dto, owner);
    const created = await this.tournamentAdRepo.createTournamentAd(tournamentAd);
    await this.sendReviewMessage(created);
    return created;
  }

  async deleteExternalTournamentAd(adId: string, owner: string): Promise<void> {
    if (!Types.ObjectId.isValid(adId))
      throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND);
    const deletedCount = await this.tournamentAdRepo.deleteTournamentAd(
      adId,
      owner,
    );
    if (deletedCount === 0) throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND);
  }

  private async sendReviewMessage(ad: ExternalTournamentAd): Promise<void> {
    if (!this.discordService.isEnabled()) {
      this.logger.warn(
        `Discord integration disabled; league ad ${ad._id} awaits review but no review message was sent.`,
      );
      return;
    }

    const formatDate = (value?: Date) =>
      value ? value.toISOString().split("T")[0] : "TBD";

    const embed = new EmbedBuilder()
      .setTitle(this.clamp(ad.leagueName, 256))
      .setDescription(this.clamp(ad.description, 1024))
      .setColor("#2F80ED")
      .setTimestamp(new Date())
      .addFields(
        { name: "Status", value: "Pending", inline: true },
        {
          name: "Skill Range",
          value: `${ad.skillLevelRange.from} - ${ad.skillLevelRange.to}`,
          inline: true,
        },
        { name: "Prize", value: ad.prizeValue.toString(), inline: true },
        {
          name: "Platforms",
          value: this.clamp(ad.platforms.join(", "), FIELD_LIMIT),
          inline: false,
        },
        {
          name: "Formats",
          value: this.clamp(ad.formats.join(", "), FIELD_LIMIT),
          inline: false,
        },
        {
          name: "Rulesets",
          value: this.clamp(ad.rulesets.join(", "), FIELD_LIMIT),
          inline: false,
        },
        {
          name: "Signups Close",
          value: formatDate(ad.closesAt),
          inline: true,
        },
        {
          name: "Season",
          value: `${formatDate(ad.seasonStart)} - ${formatDate(ad.seasonEnd)}`,
          inline: true,
        },
        {
          name: "Signup Link",
          value: this.clamp(ad.signupLink, FIELD_LIMIT),
          inline: false,
        },
        {
          name: "Server Link",
          value: ad.serverLink ? this.clamp(ad.serverLink, FIELD_LIMIT) : "N/A",
          inline: false,
        },
        {
          name: "League Doc",
          value: ad.leagueDoc ? this.clamp(ad.leagueDoc, FIELD_LIMIT) : "N/A",
          inline: false,
        },
      );

    const actionRow = this.buildReviewButtons(ad._id!, false);

    const sent = await this.discordService.sendMessage(REVIEW_CHANNEL_ID, {
      content: "A new league ad has been submitted.",
      embeds: [embed],
      components: [actionRow],
    });
    if (!sent) {
      this.logger.warn(`Failed to send review message for league ad ${ad._id}`);
    }
  }

  private async handleReviewAction(
    action: string,
    adId: string,
    interaction: ButtonInteraction,
  ): Promise<void> {
    if (action !== "approve" && action !== "deny") return;
    const status = action === "approve" ? "Approved" : "Denied";

    const updated = Types.ObjectId.isValid(adId)
      ? await this.tournamentAdRepo.updateStatus(adId, status)
      : null;

    if (!updated) {
      await interaction.reply({
        content: "This league ad no longer exists.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingEmbed = interaction.message.embeds[0];
    const embed = existingEmbed
      ? EmbedBuilder.from(existingEmbed)
      : new EmbedBuilder().setTitle("League Ad Review");

    const fields = existingEmbed?.fields ? [...existingEmbed.fields] : [];
    const statusIndex = fields.findIndex((field) => field.name === "Status");
    const statusField = { name: "Status", value: status, inline: true };
    if (statusIndex >= 0) {
      fields[statusIndex] = statusField;
    } else {
      fields.unshift(statusField);
    }
    embed.setFields(fields);

    await interaction.update({
      embeds: [embed],
      components: [this.buildReviewButtons(adId, true)],
    });
    this.logger.log(`League ad ${adId} ${status.toLowerCase()} via Discord.`);
  }

  private buildReviewButtons(
    adId: string,
    disabled: boolean,
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${REVIEW_BUTTON_SCOPE}:approve:${adId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`${REVIEW_BUTTON_SCOPE}:deny:${adId}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    );
  }

  private clamp(value: string, limit: number): string {
    return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
  }
}
