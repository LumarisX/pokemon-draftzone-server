import { S3Service } from "@core/storage/s3.service";
import { DiscordService } from "@modules/discord/discord.service";
import { TournamentApplicationRepository } from "@modules/tournament-application/tournament-application.repository";
import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { EmbedBuilder } from "discord.js";
import { activeQuestions } from "./signup-questions";
import {
  ApplicationSubmittedEvent,
  CoachSeatedEvent,
  TOURNAMENT_EVENTS,
} from "./tournament-events";

const DISCORD_EMBED_FIELDS = 25;
const BASE_EMBED_FIELDS = 4;

function clamp(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

@Injectable()
export class TournamentNotificationsService {
  private readonly logger = new Logger(TournamentNotificationsService.name);

  constructor(
    private readonly applicationRepo: TournamentApplicationRepository,
    private readonly discordService: DiscordService,
    private readonly s3Service: S3Service,
  ) {}

  @OnEvent(TOURNAMENT_EVENTS.applicationSubmitted, { async: true })
  async announceSignUp({
    tournament,
    signUp,
    answers,
  }: ApplicationSubmittedEvent): Promise<void> {
    try {
      const { signUpChannelId } = tournament.discordSettings ?? {};
      if (!signUpChannelId) return;

      const totalCoaches = await this.applicationRepo.countByStatuses(
        tournament.id,
        ["pending", "waitlisted", "approved"],
      );

      const labels = new Map(
        activeQuestions(tournament.signUpQuestions).map((question) => [
          question.id,
          question.label,
        ]),
      );
      const answerFields = answers
        .slice(0, DISCORD_EMBED_FIELDS - BASE_EMBED_FIELDS)
        .map((answer) => ({
          name: clamp(labels.get(answer.questionId) ?? answer.questionId, 256),
          value: clamp(answer.values.join(", ") || "-", 1024),
          inline: false,
        }));

      const embed = new EmbedBuilder()
        .setTitle(clamp(signUp.name, 256))
        .setColor("#2F80ED")
        .setTimestamp(new Date())
        .addFields(
          { name: "Team Name", value: signUp.teamName, inline: true },
          { name: "In-Game Name", value: signUp.gameName, inline: true },
          { name: "Discord Name", value: signUp.discordName, inline: true },
          { name: "Timezone", value: signUp.timezone, inline: true },
          ...answerFields,
        );

      if (signUp.logo && this.s3Service.isEnabled()) {
        embed.setImage(this.s3Service.getPublicUrl(signUp.logo));
      }

      await this.discordService.sendMessage(signUpChannelId, {
        content: `There's a new sign up for **${tournament.name}**! Total sign ups: ${totalCoaches}`,
        embeds: [embed],
      });
    } catch (error) {
      this.logger.warn(
        `Failed to announce a sign-up for tournament ${tournament.id}`,
        error,
      );
    }
  }

  @OnEvent(TOURNAMENT_EVENTS.coachSeated, { async: true })
  async grantCoachRole({
    tournament,
    discordName,
  }: CoachSeatedEvent): Promise<void> {
    try {
      const { guildId, coachRoleId, autoGrantCoachRole } =
        tournament.discordSettings ?? {};
      if (autoGrantCoachRole === false) return;

      const handle = discordName?.trim();
      if (!handle || !guildId || !coachRoleId) return;

      const member = await this.discordService.findMember(guildId, handle);
      if (member) {
        await this.discordService.grantRole(guildId, member.id, coachRoleId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to grant the coach role: ${(error as Error).message}`,
      );
    }
  }
}
