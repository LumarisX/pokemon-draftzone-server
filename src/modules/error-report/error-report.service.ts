import { DiscordService } from "@modules/discord/discord.service";
import { Injectable, Logger } from "@nestjs/common";
import { EmbedBuilder } from "discord.js";
import { ErrorReportDto } from "./error-report.dto";

const ERROR_REPORT_CHANNEL_ID = "1520852048718074036";

const FIELD_LIMIT = 1024;

@Injectable()
export class ErrorReportService {
  private readonly logger = new Logger(ErrorReportService.name);

  constructor(private readonly discordService: DiscordService) {}

  async submit(report: ErrorReportDto, sub?: string): Promise<boolean> {
    if (!this.discordService.isEnabled()) {
      this.logger.warn(
        "Discord integration disabled; dropping client error report.",
      );
      return false;
    }

    const embed = this.buildEmbed(report, sub);
    return this.discordService.sendMessage(ERROR_REPORT_CHANNEL_ID, {
      embeds: [embed],
    });
  }

  private buildEmbed(report: ErrorReportDto, sub?: string): EmbedBuilder {
    const title = report.status
      ? `Error ${report.status}${report.code ? ` — ${report.code}` : ""}`
      : (report.code ?? "Client Error");

    const embed = new EmbedBuilder()
      .setTitle(this.clamp(title, 256))
      .setColor("#E53935")
      .setTimestamp(new Date());

    if (report.message) {
      embed.setDescription(this.clamp(report.message, 4096));
    }

    const fields: { name: string; value: string; inline?: boolean }[] = [];

    fields.push({
      name: "User",
      value: sub ? this.clamp(sub, FIELD_LIMIT) : "Logged out",
      inline: true,
    });
    if (report.url) {
      fields.push({
        name: "Request URL",
        value: this.clamp(report.url, FIELD_LIMIT),
      });
    }
    if (report.pageUrl) {
      fields.push({
        name: "Page",
        value: this.clamp(report.pageUrl, FIELD_LIMIT),
      });
    }
    if (report.requestId) {
      fields.push({
        name: "Request ID",
        value: this.clamp(report.requestId, FIELD_LIMIT),
        inline: true,
      });
    }
    if (report.userAgent) {
      fields.push({
        name: "User Agent",
        value: this.clamp(report.userAgent, FIELD_LIMIT),
      });
    }
    if (report.details && Object.keys(report.details).length > 0) {
      fields.push({
        name: "Details",
        value: this.codeBlock(this.stringify(report.details)),
      });
    }
    if (report.stack) {
      fields.push({
        name: "Stack Trace",
        value: this.codeBlock(report.stack),
      });
    }

    if (fields.length > 0) embed.addFields(fields);

    return embed;
  }

  private stringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /** Wraps text in a fenced code block, clamped to fit the field limit. */
  private codeBlock(value: string): string {
    const fence = "```";
    const room = FIELD_LIMIT - fence.length * 2 - 2;
    return `${fence}\n${this.clamp(value, room)}\n${fence}`;
  }

  private clamp(value: string, limit: number): string {
    return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
  }
}
