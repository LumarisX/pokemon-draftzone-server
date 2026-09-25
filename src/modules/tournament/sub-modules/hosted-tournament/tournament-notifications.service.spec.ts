import { S3Service } from "@core/storage/s3.service";
import { DiscordService } from "@modules/discord/discord.service";
import { TournamentApplicationRepository } from "@modules/tournament-application/tournament-application.repository";
import { EventEmitter2, EventEmitterModule } from "@nestjs/event-emitter";
import { Test } from "@nestjs/testing";
import { SignUpDto } from "./hosted-tournament.dto";
import { TOURNAMENT_EVENTS } from "./tournament-events";
import { TournamentNotificationsService } from "./tournament-notifications.service";

function buildTournament(discordSettings?: Record<string, unknown>) {
  return {
    id: "tournament-1",
    name: "Spring Cup",
    signUpQuestions: [],
    discordSettings,
  } as any;
}

const SIGN_UP = {
  name: "Ash Ketchum",
  teamName: "Team Rocket",
  gameName: "AshK",
  discordName: "ash#1234",
  timezone: "America/Los_Angeles",
  confirm: true,
} as SignUpDto;

const LINKED = {
  guildId: "guild-1",
  coachRoleId: "role-1",
  signUpChannelId: "channel-1",
};

describe("TournamentNotificationsService", () => {
  let applicationRepo: jest.Mocked<TournamentApplicationRepository>;
  let discord: jest.Mocked<DiscordService>;
  let s3: jest.Mocked<S3Service>;
  let service: TournamentNotificationsService;

  beforeEach(() => {
    applicationRepo = {
      countByStatuses: jest.fn().mockResolvedValue(7),
    } as unknown as jest.Mocked<TournamentApplicationRepository>;
    discord = {
      sendMessage: jest.fn().mockResolvedValue(true),
      findMember: jest.fn().mockResolvedValue({ id: "member-1", roleIds: [] }),
      grantRole: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<DiscordService>;
    s3 = {
      isEnabled: jest.fn().mockReturnValue(true),
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
    } as unknown as jest.Mocked<S3Service>;
    service = new TournamentNotificationsService(applicationRepo, discord, s3);
  });

  describe("announceSignUp", () => {
    it("posts the sign-up with the running total to the sign-up channel", async () => {
      await service.announceSignUp({
        tournament: buildTournament(LINKED),
        signUp: { ...SIGN_UP, logo: "team-logos/rocket.png" },
        answers: [],
      });

      expect(applicationRepo.countByStatuses).toHaveBeenCalledWith(
        "tournament-1",
        ["pending", "waitlisted", "approved"],
      );
      const [channelId, payload] = discord.sendMessage.mock.calls[0];
      expect(channelId).toBe("channel-1");
      expect(payload.content).toContain("Total sign ups: 7");
      const embed = (payload.embeds![0] as any).toJSON();
      expect(embed.title).toBe("Ash Ketchum");
      expect(embed.image.url).toBe(
        "https://cdn.example.com/team-logos/rocket.png",
      );
    });

    it("does nothing without a sign-up channel", async () => {
      await service.announceSignUp({
        tournament: buildTournament(),
        signUp: SIGN_UP,
        answers: [],
      });

      expect(discord.sendMessage).not.toHaveBeenCalled();
    });

    it("swallows a Discord failure", async () => {
      discord.sendMessage.mockRejectedValue(new Error("rate limited"));

      await expect(
        service.announceSignUp({
          tournament: buildTournament(LINKED),
          signUp: SIGN_UP,
          answers: [],
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("grantCoachRole", () => {
    it("grants the coach role to the member it finds", async () => {
      await service.grantCoachRole({
        tournament: buildTournament(LINKED),
        discordName: " ash#1234 ",
      });

      expect(discord.findMember).toHaveBeenCalledWith("guild-1", "ash#1234");
      expect(discord.grantRole).toHaveBeenCalledWith(
        "guild-1",
        "member-1",
        "role-1",
      );
    });

    it("honours autoGrantCoachRole: false", async () => {
      await service.grantCoachRole({
        tournament: buildTournament({ ...LINKED, autoGrantCoachRole: false }),
        discordName: "ash#1234",
      });

      expect(discord.findMember).not.toHaveBeenCalled();
      expect(discord.grantRole).not.toHaveBeenCalled();
    });

    it.each([
      ["no linked server", { coachRoleId: "role-1" }, "ash#1234"],
      ["no coach role", { guildId: "guild-1" }, "ash#1234"],
      ["no Discord name", LINKED, "  "],
    ])("does nothing with %s", async (_, settings, discordName) => {
      await service.grantCoachRole({
        tournament: buildTournament(settings),
        discordName,
      });

      expect(discord.grantRole).not.toHaveBeenCalled();
    });

    it("grants nothing when the member isn't in the server", async () => {
      discord.findMember.mockResolvedValue(null);

      await service.grantCoachRole({
        tournament: buildTournament(LINKED),
        discordName: "ash#1234",
      });

      expect(discord.grantRole).not.toHaveBeenCalled();
    });

    it("swallows a Discord failure", async () => {
      discord.findMember.mockRejectedValue(new Error("gateway down"));

      await expect(
        service.grantCoachRole({
          tournament: buildTournament(LINKED),
          discordName: "ash#1234",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("wired to the event bus", () => {
    it("runs both handlers from emitted events, after emit has returned", async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          TournamentNotificationsService,
          { provide: TournamentApplicationRepository, useValue: applicationRepo },
          { provide: DiscordService, useValue: discord },
          { provide: S3Service, useValue: s3 },
        ],
      }).compile();
      await moduleRef.init();
      const bus = moduleRef.get(EventEmitter2);

      bus.emit(TOURNAMENT_EVENTS.applicationSubmitted, {
        tournament: buildTournament(LINKED),
        signUp: SIGN_UP,
        answers: [],
      });
      bus.emit(TOURNAMENT_EVENTS.coachSeated, {
        tournament: buildTournament(LINKED),
        discordName: "ash#1234",
      });

      expect(discord.sendMessage).not.toHaveBeenCalled();
      expect(discord.findMember).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(discord.sendMessage).toHaveBeenCalledTimes(1);
      expect(discord.grantRole).toHaveBeenCalledWith(
        "guild-1",
        "member-1",
        "role-1",
      );
      await moduleRef.close();
    });
  });
});
