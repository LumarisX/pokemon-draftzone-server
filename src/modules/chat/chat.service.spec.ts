import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachRepository } from "@modules/coach/coach.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { UserService } from "@modules/user/user.service";
import { Types } from "mongoose";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";

const TOURNAMENT_ID = new Types.ObjectId();

function buildCoach(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    auth0Id: "auth0|coach",
    name: "Co-Coach Casey",
    teamId: new Types.ObjectId(),
    ...overrides,
  };
}

function buildTeam(id: Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    tournamentId: TOURNAMENT_ID,
    status: "approved",
    primaryCoach: { name: "Primary Pat" },
    ...overrides,
  };
}

describe("ChatService", () => {
  let coachRepo: jest.Mocked<CoachRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let chatRepo: jest.Mocked<ChatRepository>;
  let userService: jest.Mocked<UserService>;
  let service: ChatService;

  beforeEach(() => {
    chatRepo = {
      findByRoom: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (data: Record<string, unknown>) => ({
        _id: new Types.ObjectId(),
        ...data,
      })),
    } as unknown as jest.Mocked<ChatRepository>;
    coachRepo = {
      findByAuth0Id: jest.fn(),
    } as unknown as jest.Mocked<CoachRepository>;
    teamRepo = {
      findManyByIds: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;
    userService = {
      profileIdsFor: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<UserService>;
    const tournament = {
      id: TOURNAMENT_ID.toString(),
      owner: "auth0|owner",
      staff: [],
      matchSettings: {},
    };
    service = new ChatService(
      chatRepo,
      {
        findBySlug: jest.fn().mockResolvedValue(tournament),
        findBySlugCached: jest.fn().mockResolvedValue(tournament),
      } as unknown as HostedTournamentRepository,
      teamRepo,
      coachRepo,
      {} as LeagueMatchupRepository,
      userService,
    );
  });

  function seat(
    coachOverrides: Record<string, unknown> = {},
    teamOverrides: Record<string, unknown> = {},
  ) {
    const coach = buildCoach(coachOverrides);
    coachRepo.findByAuth0Id.mockResolvedValue([coach] as never);
    teamRepo.findManyByIds.mockResolvedValue([
      buildTeam(coach.teamId, teamOverrides),
    ] as never);
    return coach;
  }

  it("lets an active coach on an approved team read the tournament channel", async () => {
    seat();

    await expect(
      service.getMessages("league", "tournament", "tournament", undefined, "auth0|coach"),
    ).resolves.toMatchObject({ canPost: true });
  });

  it("refuses a coach who has left the team", async () => {
    seat({ leftAt: new Date() });

    await expect(
      service.getMessages("league", "tournament", "tournament", undefined, "auth0|coach"),
    ).rejects.toMatchObject({ code: ErrorCodes.CHAT.FORBIDDEN.code });
  });

  it.each(["dropped", "denied", "pending"])(
    "refuses a coach whose team is %s",
    async (status) => {
      seat({}, { status });

      await expect(
        service.getMessages("league", "tournament", "tournament", undefined, "auth0|coach"),
      ).rejects.toMatchObject({ code: ErrorCodes.CHAT.FORBIDDEN.code });
    },
  );

  it("adds each author's profile id to the messages with one lookup", async () => {
    seat();
    chatRepo.findByRoom.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        author: "auth0|a",
        authorName: "Ash",
        authorRole: "coach",
        text: "hi",
        createdAt: new Date(),
      },
      {
        _id: new Types.ObjectId(),
        author: "auth0|b",
        authorName: "Misty",
        authorRole: "coach",
        text: "yo",
        createdAt: new Date(),
      },
      {
        _id: new Types.ObjectId(),
        author: "auth0|a",
        authorName: "Ash",
        authorRole: "coach",
        text: "again",
        createdAt: new Date(),
      },
    ] as never);
    userService.profileIdsFor.mockResolvedValue(new Map([["auth0|a", "p-ash"]]));

    const result = await service.getMessages(
      "league",
      "tournament",
      "tournament",
      undefined,
      "auth0|coach",
    );

    expect(userService.profileIdsFor).toHaveBeenCalledTimes(1);
    expect(result.messages.map((m) => m.authorProfileId)).toEqual([
      "p-ash",
      undefined,
      "p-ash",
    ]);
  });

  it("keeps a deleted coach's name and shows other deleted authors as Deleted Account", async () => {
    seat();
    const message = (author: string, authorName: string, authorRole: string) => ({
      _id: new Types.ObjectId(),
      author,
      authorName,
      authorRole,
      text: "hi",
      createdAt: new Date(),
    });
    chatRepo.findByRoom.mockResolvedValue([
      message("deleted:aa", "Ash", "coach"),
      message("deleted:aa", "Organizer", "organizer"),
      message("deleted:bb", "Spectator", "spectator"),
      message("auth0|live", "Spectator", "spectator"),
    ] as never);
    userService.profileIdsFor.mockResolvedValue(new Map());

    const result = await service.getMessages(
      "league",
      "tournament",
      "tournament",
      undefined,
      "auth0|coach",
    );

    expect(result.messages.map((m) => m.author)).toEqual([
      "Ash",
      "Deleted Account",
      "Deleted Account",
      "Spectator",
    ]);
  });

  it("returns the poster's profile id on a new message", async () => {
    seat();
    userService.profileIdsFor.mockResolvedValue(
      new Map([["auth0|coach", "p-casey"]]),
    );

    const { message } = await service.postMessage(
      "league",
      "tournament",
      "tournament",
      "auth0|coach",
      { text: "gl hf" },
    );

    expect(message.authorProfileId).toBe("p-casey");
  });

  it("signs a message with the poster's own name, not the primary coach's", async () => {
    seat();

    await service.postMessage("league", "tournament", "tournament", "auth0|coach", {
      text: "gl hf",
    });

    expect(chatRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: "Co-Coach Casey",
        authorRole: "coach",
      }),
    );
  });
});
