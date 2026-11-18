import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachRepository } from "@modules/coach/coach.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { UserService } from "@modules/user/user.service";
import { Types } from "mongoose";
import { ChatReportRepository } from "./chat-report.repository";
import { ChatReportService } from "./chat-report.service";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";

const TOURNAMENT_ID = new Types.ObjectId();
const OTHER_TOURNAMENT_ID = new Types.ObjectId();
const OWNER = "auth0|owner";
const ORGANIZER = "auth0|organizer";
const COACH = "auth0|coach";
const AUTHOR = "auth0|author";
const ADMIN = "auth0|site-admin";

function buildMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tournament: TOURNAMENT_ID,
    channel: "tournament",
    target: "",
    author: AUTHOR,
    authorName: "Author Ann",
    authorRole: "coach",
    text: "something rude",
    createdAt: new Date("2026-11-01"),
    ...overrides,
  } as any;
}

function buildReport(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    message: new Types.ObjectId(),
    tournament: TOURNAMENT_ID,
    channel: "tournament",
    target: "",
    reporter: COACH,
    reporterName: "Reporter Rae",
    reason: "rude",
    messageText: "something rude",
    messageAuthor: AUTHOR,
    messageAuthorName: "Author Ann",
    escalated: false,
    status: "open",
    createdAt: new Date("2026-11-02"),
    ...overrides,
  } as any;
}

describe("ChatReportService", () => {
  let chatService: jest.Mocked<ChatService>;
  let chatRepo: jest.Mocked<ChatRepository>;
  let reportRepo: jest.Mocked<ChatReportRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let userService: jest.Mocked<UserService>;
  let service: ChatReportService;
  let tournament: Record<string, unknown>;

  beforeEach(() => {
    tournament = {
      id: TOURNAMENT_ID.toString(),
      owner: OWNER,
      staff: [{ sub: ORGANIZER, role: "organizer" }],
      name: "Spring Cup",
      slug: "spring-cup",
      leagueName: "Spring League",
      leagueSlug: "spring-league",
    };
    chatService = {
      resolveReadableMessage: jest.fn(),
    } as unknown as jest.Mocked<ChatService>;
    chatRepo = {
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([]),
      softDelete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ChatRepository>;
    reportRepo = {
      findOpen: jest.fn().mockResolvedValue(null),
      createOrGetOpen: jest.fn(async (input: Record<string, unknown>) =>
        buildReport({ ...input }),
      ),
      findById: jest.fn(),
      listOpenForTournament: jest.fn().mockResolvedValue([]),
      listOpenEscalated: jest.fn().mockResolvedValue([]),
      resolveOne: jest.fn().mockResolvedValue(undefined),
      resolveOpenForMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ChatReportRepository>;
    tournamentRepo = {
      findBySlug: jest.fn().mockImplementation(async () => tournament),
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    userService = {
      namesFor: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<UserService>;
    service = new ChatReportService(
      chatService,
      chatRepo,
      reportRepo,
      tournamentRepo,
      userService,
    );
  });

  describe("report", () => {
    function readable(message = buildMessage()) {
      chatService.resolveReadableMessage.mockResolvedValue({
        tournament,
        message,
        viewer: { authorName: "Reporter Rae" },
      } as never);
      return message;
    }

    it("stores a snapshot of the message and who wrote it", async () => {
      const message = readable();

      const result = await service.report("l", "t", message._id.toString(), COACH, {
        reason: "rude",
      });

      expect(chatService.resolveReadableMessage).toHaveBeenCalledWith(
        "l",
        "t",
        message._id.toString(),
        COACH,
      );
      expect(reportRepo.createOrGetOpen).toHaveBeenCalledWith({
        message: message._id,
        tournament: TOURNAMENT_ID,
        channel: "tournament",
        target: "",
        reporter: COACH,
        reporterName: "Reporter Rae",
        reason: "rude",
        messageText: "something rude",
        messageAuthor: AUTHOR,
        messageAuthorName: "Author Ann",
        escalated: false,
      });
      expect(result).toMatchObject({ status: "open" });
      expect(result).not.toHaveProperty("escalated");
    });

    it("refuses a reader who is not allowed in the channel", async () => {
      chatService.resolveReadableMessage.mockRejectedValue(
        Object.assign(new Error("no"), { code: ErrorCodes.CHAT.FORBIDDEN.code }),
      );

      await expect(
        service.report("l", "t", new Types.ObjectId().toString(), COACH, {
          reason: "x",
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.CHAT.FORBIDDEN.code });
      expect(reportRepo.createOrGetOpen).not.toHaveBeenCalled();
    });

    it("refuses to report your own message", async () => {
      const message = readable(buildMessage({ author: COACH }));

      await expect(
        service.report("l", "t", message._id.toString(), COACH, { reason: "x" }),
      ).rejects.toMatchObject({
        code: ErrorCodes.CHAT.CANNOT_REPORT_OWN.code,
        status: 400,
      });
      expect(reportRepo.createOrGetOpen).not.toHaveBeenCalled();
    });

    it("returns the existing open report instead of a duplicate", async () => {
      const message = readable();
      const existing = buildReport({ message: message._id });
      reportRepo.findOpen.mockResolvedValue(existing);

      const result = await service.report(
        "l",
        "t",
        message._id.toString(),
        COACH,
        { reason: "again" },
      );

      expect(result.id).toBe(existing._id.toString());
      expect(reportRepo.createOrGetOpen).not.toHaveBeenCalled();
    });

    it.each([
      ["the owner", OWNER],
      ["an organizer", ORGANIZER],
    ])("escalates a report about %s", async (_label, author) => {
      const message = readable(buildMessage({ author }));

      await service.report("l", "t", message._id.toString(), COACH, {
        reason: "x",
      });

      expect(reportRepo.createOrGetOpen).toHaveBeenCalledWith(
        expect.objectContaining({ escalated: true }),
      );
    });
  });

  describe("listForTournament", () => {
    it("is for staff only", async () => {
      await expect(service.listForTournament("l", "t", COACH)).rejects.toMatchObject(
        { code: ErrorCodes.AUTH.FORBIDDEN.code },
      );
      expect(reportRepo.listOpenForTournament).not.toHaveBeenCalled();
    });

    it("asks only for open, non-escalated reports of this tournament", async () => {
      await service.listForTournament("l", "t", ORGANIZER);

      expect(reportRepo.listOpenForTournament).toHaveBeenCalledWith(
        TOURNAMENT_ID.toString(),
      );
      expect(reportRepo.listOpenEscalated).not.toHaveBeenCalled();
    });

    it("shows names and profile ids, the snapshot text and whether the message survives, with no account ids", async () => {
      const live = buildMessage();
      const gone = buildMessage({ deletedAt: new Date() });
      const first = buildReport({ message: live._id });
      const second = buildReport({ message: gone._id, messageAuthor: "auth0|other" });
      reportRepo.listOpenForTournament.mockResolvedValue([first, second]);
      chatRepo.findByIds.mockResolvedValue([live, gone]);
      userService.namesFor.mockResolvedValue(
        new Map([
          [COACH, { profileId: "p-rae", displayName: "Rae", username: null }],
          [AUTHOR, { profileId: "p-ann", displayName: null, username: null }],
        ]),
      );

      const { reports } = await service.listForTournament("l", "t", ORGANIZER);

      expect(userService.namesFor).toHaveBeenCalledTimes(1);
      expect(chatRepo.findByIds).toHaveBeenCalledTimes(1);
      expect(reports).toEqual([
        {
          id: first._id.toString(),
          messageId: live._id.toString(),
          channel: "tournament",
          target: undefined,
          reason: "rude",
          createdAt: first.createdAt,
          reporter: { name: "Rae", profileId: "p-rae" },
          author: { name: "Author Ann", profileId: "p-ann" },
          text: "something rude",
          messageExists: true,
        },
        {
          id: second._id.toString(),
          messageId: gone._id.toString(),
          channel: "tournament",
          target: undefined,
          reason: "rude",
          createdAt: second.createdAt,
          reporter: { name: "Rae", profileId: "p-rae" },
          author: { name: "Author Ann", profileId: undefined },
          text: "something rude",
          messageExists: false,
        },
      ]);
      const serialized = JSON.stringify(reports);
      expect(serialized).not.toContain(COACH);
      expect(serialized).not.toContain(AUTHOR);
    });
  });

  describe("resolveForTournament", () => {
    it("is for staff only", async () => {
      await expect(
        service.resolveForTournament("l", "t", "r", COACH, "dismiss"),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
    });

    it("dismisses just that report", async () => {
      const report = buildReport();
      reportRepo.findById.mockResolvedValue(report);

      const result = await service.resolveForTournament(
        "l",
        "t",
        report._id.toString(),
        ORGANIZER,
        "dismiss",
      );

      expect(result).toEqual({ resolved: true, action: "dismiss" });
      expect(reportRepo.resolveOne).toHaveBeenCalledWith(
        report._id,
        "dismissed",
        ORGANIZER,
      );
      expect(chatRepo.softDelete).not.toHaveBeenCalled();
      expect(reportRepo.resolveOpenForMessage).not.toHaveBeenCalled();
    });

    it("removes the message through the shared delete and closes every open report on it", async () => {
      const message = buildMessage();
      const report = buildReport({ message: message._id });
      reportRepo.findById.mockResolvedValue(report);
      chatRepo.findById.mockResolvedValue(message);

      await service.resolveForTournament(
        "l",
        "t",
        report._id.toString(),
        ORGANIZER,
        "remove",
      );

      expect(chatRepo.softDelete).toHaveBeenCalledWith(message._id, ORGANIZER);
      expect(reportRepo.resolveOpenForMessage).toHaveBeenCalledWith(
        message._id,
        "removed",
        ORGANIZER,
      );
      expect(reportRepo.resolveOne).not.toHaveBeenCalled();
    });

    it("does not delete a message twice but still closes the reports", async () => {
      const message = buildMessage({ deletedAt: new Date() });
      const report = buildReport({ message: message._id });
      reportRepo.findById.mockResolvedValue(report);
      chatRepo.findById.mockResolvedValue(message);

      await service.resolveForTournament(
        "l",
        "t",
        report._id.toString(),
        ORGANIZER,
        "remove",
      );

      expect(chatRepo.softDelete).not.toHaveBeenCalled();
      expect(reportRepo.resolveOpenForMessage).toHaveBeenCalled();
    });

    it.each([
      ["escalated", { escalated: true }],
      ["already resolved", { status: "dismissed" }],
      ["from another tournament", { tournament: OTHER_TOURNAMENT_ID }],
    ])("treats a report that is %s as not found", async (_label, overrides) => {
      reportRepo.findById.mockResolvedValue(buildReport(overrides));

      await expect(
        service.resolveForTournament("l", "t", "r", ORGANIZER, "dismiss"),
      ).rejects.toMatchObject({
        code: ErrorCodes.CHAT.REPORT_NOT_FOUND.code,
        status: 404,
      });
      expect(reportRepo.resolveOne).not.toHaveBeenCalled();
    });

    it("treats an unknown report as not found", async () => {
      reportRepo.findById.mockResolvedValue(null);

      await expect(
        service.resolveForTournament("l", "t", "nope", ORGANIZER, "dismiss"),
      ).rejects.toMatchObject({ code: ErrorCodes.CHAT.REPORT_NOT_FOUND.code });
    });
  });

  describe("site admin", () => {
    it("lists only escalated reports with league and tournament names", async () => {
      const report = buildReport({ escalated: true, messageAuthor: ORGANIZER });
      const orphan = buildReport({
        escalated: true,
        tournament: OTHER_TOURNAMENT_ID,
      });
      reportRepo.listOpenEscalated.mockResolvedValue([report, orphan]);
      tournamentRepo.findManyByIds.mockResolvedValue([tournament as never]);

      const { reports } = await service.listEscalated();

      expect(reportRepo.listOpenForTournament).not.toHaveBeenCalled();
      expect(tournamentRepo.findManyByIds).toHaveBeenCalledTimes(1);
      expect(reports[0]).toMatchObject({
        id: report._id.toString(),
        league: { name: "Spring League", slug: "spring-league" },
        tournament: { name: "Spring Cup", slug: "spring-cup" },
      });
      expect(reports[1]).toMatchObject({ league: null, tournament: null });
    });

    it("resolves an escalated report, deleting the message as the admin", async () => {
      const message = buildMessage({ author: ORGANIZER });
      const report = buildReport({ escalated: true, message: message._id });
      reportRepo.findById.mockResolvedValue(report);
      chatRepo.findById.mockResolvedValue(message);

      await service.resolveEscalated(report._id.toString(), ADMIN, "remove");

      expect(chatRepo.softDelete).toHaveBeenCalledWith(message._id, ADMIN);
      expect(reportRepo.resolveOpenForMessage).toHaveBeenCalledWith(
        message._id,
        "removed",
        ADMIN,
      );
    });

    it("dismisses an escalated report", async () => {
      const report = buildReport({ escalated: true });
      reportRepo.findById.mockResolvedValue(report);

      await service.resolveEscalated(report._id.toString(), ADMIN, "dismiss");

      expect(reportRepo.resolveOne).toHaveBeenCalledWith(
        report._id,
        "dismissed",
        ADMIN,
      );
    });

    it("leaves organizer-level reports to the organizers", async () => {
      reportRepo.findById.mockResolvedValue(buildReport());

      await expect(
        service.resolveEscalated("r", ADMIN, "dismiss"),
      ).rejects.toMatchObject({ code: ErrorCodes.CHAT.REPORT_NOT_FOUND.code });
    });
  });
});

describe("ChatService.resolveReadableMessage", () => {
  const SEAT_COACH = { _id: new Types.ObjectId(), auth0Id: COACH, name: "Rae", teamId: new Types.ObjectId() };

  function build(options: { matchupChat?: boolean } = {}) {
    const tournament = {
      id: TOURNAMENT_ID.toString(),
      owner: OWNER,
      staff: [],
      matchSettings: { chat: options.matchupChat },
    };
    const chatRepo = { findById: jest.fn() } as unknown as jest.Mocked<ChatRepository>;
    const coachRepo = {
      findByAuth0Id: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CoachRepository>;
    const teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;
    const service = new ChatService(
      chatRepo,
      {
        findBySlug: jest.fn().mockResolvedValue(tournament),
        findBySlugCached: jest.fn().mockResolvedValue(tournament),
      } as unknown as HostedTournamentRepository,
      teamRepo,
      coachRepo,
      {} as LeagueMatchupRepository,
      {} as UserService,
    );
    return { service, chatRepo, coachRepo, teamRepo };
  }

  it("lets a coach on an approved team read the tournament channel's message", async () => {
    const { service, chatRepo, coachRepo, teamRepo } = build();
    const message = buildMessage();
    chatRepo.findById.mockResolvedValue(message);
    coachRepo.findByAuth0Id.mockResolvedValue([SEAT_COACH] as never);
    teamRepo.findManyByIds.mockResolvedValue([
      { _id: SEAT_COACH.teamId, tournamentId: TOURNAMENT_ID, status: "approved" },
    ] as never);

    await expect(
      service.resolveReadableMessage("l", "t", message._id.toString(), COACH),
    ).resolves.toMatchObject({ message });
  });

  it("refuses someone who cannot read that channel", async () => {
    const { service, chatRepo } = build();
    const message = buildMessage();
    chatRepo.findById.mockResolvedValue(message);

    await expect(
      service.resolveReadableMessage("l", "t", message._id.toString(), "auth0|stranger"),
    ).rejects.toMatchObject({ code: ErrorCodes.CHAT.FORBIDDEN.code });
  });

  it("lets anyone signed in read the spectator channel", async () => {
    const { service, chatRepo } = build();
    const message = buildMessage({ channel: "spectator" });
    chatRepo.findById.mockResolvedValue(message);

    await expect(
      service.resolveReadableMessage("l", "t", message._id.toString(), "auth0|stranger"),
    ).resolves.toBeDefined();
  });

  it("treats a deleted message, a bad id and another tournament's message as not found", async () => {
    const { service, chatRepo } = build();
    const deleted = buildMessage({ deletedAt: new Date() });
    chatRepo.findById.mockResolvedValueOnce(deleted);
    await expect(
      service.resolveReadableMessage("l", "t", deleted._id.toString(), COACH),
    ).rejects.toMatchObject({ code: ErrorCodes.CHAT.MESSAGE_NOT_FOUND.code });

    await expect(
      service.resolveReadableMessage("l", "t", "not-an-id", COACH),
    ).rejects.toMatchObject({ code: ErrorCodes.VALIDATION.INVALID_PARAMS.code });

    const foreign = buildMessage({
      channel: "spectator",
      tournament: OTHER_TOURNAMENT_ID,
    });
    chatRepo.findById.mockResolvedValueOnce(foreign);
    await expect(
      service.resolveReadableMessage("l", "t", foreign._id.toString(), COACH),
    ).rejects.toMatchObject({ code: ErrorCodes.CHAT.MESSAGE_NOT_FOUND.code });
  });
});
