import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { assertCan, isStaff } from "@modules/tournament/tournament-policy";
import { UserService } from "@modules/user/user.service";
import { Injectable } from "@nestjs/common";
import { ChatReportRepository } from "./chat-report.repository";
import { ChatReportDocument } from "./chat-report.schema";
import { ChatReportAction, ReportChatMessageDto } from "./chat.dto";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";

@Injectable()
export class ChatReportService {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatRepo: ChatRepository,
    private readonly reportRepo: ChatReportRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly userService: UserService,
  ) {}

  async report(
    leagueSlug: string,
    tournamentSlug: string,
    messageId: string,
    sub: string,
    dto: ReportChatMessageDto,
  ) {
    const { tournament, message, viewer } =
      await this.chatService.resolveReadableMessage(
        leagueSlug,
        tournamentSlug,
        messageId,
        sub,
      );
    if (message.author === sub)
      throw new PDZError(ErrorCodes.CHAT.CANNOT_REPORT_OWN, { messageId });

    const existing = await this.reportRepo.findOpen(message._id, sub);
    const report =
      existing ??
      (await this.reportRepo.createOrGetOpen({
        message: message._id,
        tournament: message.tournament,
        channel: message.channel,
        target: message.target,
        reporter: sub,
        reporterName: viewer.authorName,
        reason: dto.reason,
        messageText: message.text,
        messageAuthor: message.author,
        messageAuthorName: message.authorName,
        escalated: isStaff(tournament, message.author),
      }));

    return {
      id: report._id.toString(),
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  async listForTournament(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "moderateChat");

    const reports = await this.reportRepo.listOpenForTournament(tournament.id);
    return { reports: await this.toViews(reports) };
  }

  async resolveForTournament(
    leagueSlug: string,
    tournamentSlug: string,
    reportId: string,
    sub: string,
    action: ChatReportAction,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "moderateChat");

    const report = await this.reportRepo.findById(reportId);
    if (
      !report ||
      report.status !== "open" ||
      report.escalated ||
      report.tournament.toString() !== tournament.id
    )
      throw new PDZError(ErrorCodes.CHAT.REPORT_NOT_FOUND, { reportId });

    await this.apply(report, action, sub);
    return { resolved: true, action };
  }

  async listEscalated() {
    const reports = await this.reportRepo.listOpenEscalated();
    const views = await this.toViews(reports);

    const tournaments = await this.tournamentRepo.findManyByIds([
      ...new Set(reports.map((report) => report.tournament.toString())),
    ]);
    const byId = new Map(tournaments.map((item) => [item.id, item]));

    return {
      reports: views.map((view, index) => {
        const tournament = byId.get(reports[index].tournament.toString());
        return {
          ...view,
          league: tournament
            ? { name: tournament.leagueName, slug: tournament.leagueSlug }
            : null,
          tournament: tournament
            ? { name: tournament.name, slug: tournament.slug }
            : null,
        };
      }),
    };
  }

  async resolveEscalated(
    reportId: string,
    sub: string,
    action: ChatReportAction,
  ) {
    const report = await this.reportRepo.findById(reportId);
    if (!report || report.status !== "open" || !report.escalated)
      throw new PDZError(ErrorCodes.CHAT.REPORT_NOT_FOUND, { reportId });

    await this.apply(report, action, sub);
    return { resolved: true, action };
  }

  private async apply(
    report: ChatReportDocument,
    action: ChatReportAction,
    sub: string,
  ) {
    if (action === "dismiss") {
      await this.reportRepo.resolveOne(report._id, "dismissed", sub);
      return;
    }

    const message = await this.chatRepo.findById(report.message);
    if (message && !message.deletedAt)
      await this.chatRepo.softDelete(message._id, sub);
    await this.reportRepo.resolveOpenForMessage(report.message, "removed", sub);
  }

  private async toViews(reports: ChatReportDocument[]) {
    if (reports.length === 0) return [];

    const [messages, names] = await Promise.all([
      this.chatRepo.findByIds(reports.map((report) => report.message)),
      this.userService.namesFor(
        reports.flatMap((report) => [report.reporter, report.messageAuthor]),
      ),
    ]);
    const liveMessages = new Set(
      messages
        .filter((message) => !message.deletedAt)
        .map((message) => message._id.toString()),
    );

    return reports.map((report) => {
      const reporter = names.get(report.reporter);
      const author = names.get(report.messageAuthor);
      return {
        id: report._id.toString(),
        messageId: report.message.toString(),
        channel: report.channel,
        target: report.target || undefined,
        reason: report.reason,
        createdAt: report.createdAt,
        reporter: {
          name: reporter?.displayName ?? report.reporterName,
          profileId: reporter?.profileId,
        },
        author: {
          name: author?.displayName ?? report.messageAuthorName,
          profileId: author?.profileId,
        },
        text: report.messageText,
        messageExists: liveMessages.has(report.message.toString()),
      };
    });
  }
}
