import { TransactionRunner } from "@core/database/transaction-runner";
import { ErrorCodes } from "@core/pdz-error-codes";
import { tierId } from "../../../tier-list/tier-list.test-ids";
import { S3Service } from "@core/storage/s3.service";
import { CoachRepository } from "@modules/coach/coach.repository";
import { TournamentApplicationRepository } from "@modules/tournament-application/tournament-application.repository";
import { DiscordService } from "@modules/discord/discord.service";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { TeamRepository } from "@modules/team/team.repository";
import {
  DraftCount,
  Tier,
  TierList,
  TierListPokemon,
} from "@modules/tier-list/tier-list.domain";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { UploadFolder } from "@modules/upload/upload-folder.enum";
import { UploadsService } from "@modules/upload/upload.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Types } from "mongoose";
import { HostedTournament, TierRequirement } from "./hosted-tournament.domain";
import { SignUpDto } from "./hosted-tournament.dto";
import { DEFAULT_SIGNUP_QUESTIONS } from "./signup-questions";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { HostedTournamentService } from "./hosted-tournament.service";

const LEAGUE_KEY = "spring-league";
const TOURNAMENT_KEY = "spring-cup";
const SUB = "auth0|coach-1";

function buildTournament(
  overrides: Partial<ConstructorParameters<typeof HostedTournament>[0]> = {},
) {
  return new HostedTournament({
    id: "tournament-1",
    name: "Spring Cup",
    slug: TOURNAMENT_KEY,
    signUpDeadline: new Date("2099-01-01"),
    owner: "auth0|owner",
    leagueId: "league-1",
    leagueSlug: "springleague",
    leagueName: "Spring League",
    staff: [],
    tierListId: "tier-1",
    rules: [],
    stages: [],
    forfeit: { gameDiff: 1, pokemonDiff: 6 },
    discordSettings: {
      guildId: "guild-1",
      coachRoleId: "role-1",
      signUpChannelId: "channel-1",
    },
    diffMode: "pokemon",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    draftCount: new DraftCount({ min: 1, max: 6 }),
    tierRequirements: [],
    signUpQuestions: DEFAULT_SIGNUP_QUESTIONS,
    ...overrides,
  });
}

function buildSignUpDto(overrides: Partial<SignUpDto> = {}): SignUpDto {
  return {
    name: "Ash Ketchum",
    gameName: "AshK",
    discordName: "ash#1234",
    teamName: "Team Rocket",
    timezone: "America/Los_Angeles",
    confirm: true,
    answers: [
      { questionId: "experience", values: ["5 years of competitive Pokemon"] },
      { questionId: "droppedBefore", values: ["false"] },
    ],
    ...overrides,
  };
}

const inlineTransactions = {
  run: (work: () => Promise<unknown>) => work(),
} as unknown as TransactionRunner;

const silentEvents = { emit: jest.fn() } as unknown as EventEmitter2;

function recordTransactions() {
  const log: string[] = [];
  const runner = {
    run: async (work: () => Promise<unknown>) => {
      log.push("begin");
      try {
        const result = await work();
        log.push("commit");
        return result;
      } catch (error) {
        log.push("abort");
        throw error;
      }
    },
  } as unknown as TransactionRunner;
  const track =
    <A extends unknown[], R>(name: string, result: (...args: A) => R) =>
    async (...args: A) => {
      log.push(name);
      return result(...args);
    };
  return { runner, log, track };
}

const CREATED_TEAM_SLUG = "team-rocket-a1b2";

function buildCreatedTeam(id: Types.ObjectId | string = new Types.ObjectId()) {
  return { _id: id, slug: CREATED_TEAM_SLUG } as any;
}

describe("HostedTournamentService signup", () => {
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let applicationRepo: jest.Mocked<TournamentApplicationRepository>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let discordService: jest.Mocked<DiscordService>;
  let uploads: jest.Mocked<UploadsService>;
  let events: jest.Mocked<EventEmitter2>;
  let service: HostedTournamentService;
  let tournament: HostedTournament;
  let transactions: ReturnType<typeof recordTransactions>;

  beforeEach(() => {
    tournament = buildTournament();
    transactions = recordTransactions();

    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(tournament),
      bumpRosterVersion: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    teamRepo = {
      findByIdOrNull: jest.fn(),
      findManyByIds: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      countApprovedByTournament: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<TeamRepository>;
    coachRepo = {
      findByAuth0Id: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    } as unknown as jest.Mocked<CoachRepository>;
    applicationRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
      findBlockingApplication: jest.fn().mockResolvedValue(null),
      findInTournament: jest.fn(),
      create: jest.fn(),
      decide: jest.fn(),
      countByStatuses: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<TournamentApplicationRepository>;
    draftRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<DraftRepository>;
    discordService = {
      findMember: jest.fn().mockResolvedValue(null),
      grantRole: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<DiscordService>;
    const s3Service = {
      isEnabled: jest.fn().mockReturnValue(false),
      headObject: jest.fn(),
      getPublicUrl: jest.fn(),
    } as unknown as jest.Mocked<S3Service>;
    uploads = {
      claimUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UploadsService>;
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    service = new HostedTournamentService(
      tournamentRepo,
      {} as TierListRepository,
      teamRepo,
      coachRepo,
      applicationRepo,
      draftRepo,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      discordService,
      s3Service,
      uploads,
      transactions.runner,
      events,
    );
  });

  describe("getSignup", () => {
    it("throws COACH_NOT_FOUND when the user never signed up for this tournament", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);

      await expect(
        service.getSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB),
      ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.COACH_NOT_FOUND.code });
    });

    it("ignores signups for other tournaments when matching the coach's team", async () => {
      const otherTournamentTeam = {
        _id: new Types.ObjectId(),
        tournamentId: "some-other-tournament",
        teamName: "Unrelated Team",
        status: "pending",
        draftId: undefined,
      };
      coachRepo.findByAuth0Id.mockResolvedValue([
        { _id: new Types.ObjectId(), teamId: new Types.ObjectId() } as any,
      ]);
      teamRepo.findManyByIds.mockResolvedValue([otherTournamentTeam] as any);

      await expect(
        service.getSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB),
      ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.COACH_NOT_FOUND.code });
    });

    it("returns the signed-up coach's details when no draft is assigned and the coach isn't in Discord", async () => {
      const teamId = new Types.ObjectId();
      const signedUpAt = new Date("2026-01-05");
      const coachDoc = {
        _id: new Types.ObjectId(),
        name: "Ash Ketchum",
        gameName: "AshK",
        discordName: "ash#1234",
        timezone: "America/Los_Angeles",
        signedUpAt,
        teamId,
      };
      const teamDoc = {
        _id: teamId,
        tournamentId: tournament.id,
        teamName: "Team Rocket",
        status: "pending",
        logo: undefined,
        draftId: undefined,
      };
      coachRepo.findByAuth0Id.mockResolvedValue([coachDoc as any]);
      teamRepo.findManyByIds.mockResolvedValue([teamDoc] as any);

      const result = await service.getSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB);

      expect(result).toEqual({
        name: "Ash Ketchum",
        gameName: "AshK",
        discordName: "ash#1234",
        timezone: "America/Los_Angeles",
        teamName: "Team Rocket",
        status: "pending",
        logo: undefined,
        signedUpAt,
        teamId: teamId.toString(),
        draft: null,
        inDiscordServer: false,
      });
    });

    it("includes the assigned draft and reports Discord membership when DiscordService finds the coach", async () => {
      const teamId = new Types.ObjectId();
      const draftId = new Types.ObjectId();
      coachRepo.findByAuth0Id.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          name: "Ash Ketchum",
          gameName: "AshK",
          discordName: "ash#1234",
          timezone: "America/Los_Angeles",
          signedUpAt: new Date("2026-01-05"),
          teamId,
        } as any,
      ]);
      teamRepo.findManyByIds.mockResolvedValue([
        {
          _id: teamId,
          tournamentId: tournament.id,
          teamName: "Team Rocket",
          status: "approved",
          logo: "logo-key",
          draftId,
        },
      ] as any);
      draftRepo.findById.mockResolvedValue({
        slug: "draft-1",
        name: "Draft One",
      } as any);
      discordService.findMember.mockResolvedValue({
        id: "discord-member",
        roleIds: [],
      });

      const result = await service.getSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB);

      expect(result.draft).toEqual({ draftSlug: "draft-1", name: "Draft One" });
      expect(result.inDiscordServer).toBe(true);
      expect(discordService.findMember).toHaveBeenCalledWith(
        "guild-1",
        "ash#1234",
      );
    });
  });

  describe("createSignup", () => {
    it("requires a dependent question once its trigger is answered", async () => {
      const dto = buildSignUpDto({
        answers: [
          { questionId: "experience", values: ["5 years"] },
          { questionId: "droppedBefore", values: ["true"] },
          { questionId: "droppedWhy", values: ["   "] },
        ],
      });

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, dto),
      ).rejects.toMatchObject({
        code: ErrorCodes.VALIDATION.MISSING_FIELD.code,
      });
      expect(applicationRepo.create).not.toHaveBeenCalled();
    });

    it("skips a dependent question whose trigger is not met", async () => {
      applicationRepo.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: "pending",
      } as any);

      await service.createSignup(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
        buildSignUpDto(),
      );

      const stored = applicationRepo.create.mock.calls[0][0].answers ?? [];
      expect(stored.map((entry) => entry.questionId)).toEqual([
        "experience",
        "droppedBefore",
      ]);
    });

    it("rejects an answer to a question this tournament does not ask", async () => {
      const dto = buildSignUpDto({
        answers: [
          { questionId: "experience", values: ["5 years"] },
          { questionId: "droppedBefore", values: ["false"] },
          { questionId: "favourite-colour", values: ["blue"] },
        ],
      });

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, dto),
      ).rejects.toMatchObject({
        code: ErrorCodes.VALIDATION.INVALID_PARAMS.code,
      });
    });

    it("enforces the sign-up deadline", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ signUpDeadline: new Date("2020-01-01") }),
      );

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).rejects.toMatchObject({
        code: ErrorCodes.LEAGUE.SIGNUP_CLOSED.code,
      });
    });

    it("lets a valid invite bypass a passed deadline", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          signUpDeadline: new Date("2020-01-01"),
          signUpToken: "tok-123",
        }),
      );
      applicationRepo.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: "pending",
      } as any);

      await expect(
        service.createSignup(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          SUB,
          buildSignUpDto(),
          "tok-123",
        ),
      ).resolves.toMatchObject({ message: "Sign up successful." });
    });

    it("refuses a closed tournament even with an invite", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ signUpAccess: "closed", signUpToken: "tok-123" }),
      );

      await expect(
        service.createSignup(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          SUB,
          buildSignUpDto(),
          "tok-123",
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.SIGNUP_CLOSED.code });
    });

    it("refuses an invite-only tournament without the token", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ signUpAccess: "invite", signUpToken: "tok-123" }),
      );

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.INVITE_REQUIRED.code });
    });

    it("refuses an invite-only tournament with a wrong token", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ signUpAccess: "invite", signUpToken: "tok-123" }),
      );

      await expect(
        service.createSignup(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          SUB,
          buildSignUpDto(),
          "tok-wrong",
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.INVITE_REQUIRED.code });
    });

    it("accepts an invite-only tournament with the right token", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ signUpAccess: "invite", signUpToken: "tok-123" }),
      );
      applicationRepo.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: "pending",
      } as any);

      await expect(
        service.createSignup(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          SUB,
          buildSignUpDto(),
          "tok-123",
        ),
      ).resolves.toMatchObject({ message: "Sign up successful." });
    });

    it("rejects when the confirmation checkbox isn't checked", async () => {
      const dto = buildSignUpDto({ confirm: false });

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, dto),
      ).rejects.toMatchObject({
        code: ErrorCodes.VALIDATION.MISSING_FIELD.code,
      });
      expect(teamRepo.create).not.toHaveBeenCalled();
    });

    it("rejects a second signup for a tournament the user already joined", async () => {
      const existingTeamId = new Types.ObjectId();
      coachRepo.findByAuth0Id.mockResolvedValue([
        { _id: new Types.ObjectId(), teamId: existingTeamId } as any,
      ]);
      teamRepo.findManyByIds.mockResolvedValue([
        {
          _id: existingTeamId,
          tournamentId: tournament.id,
        },
      ] as any);

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).rejects.toMatchObject({
        code: ErrorCodes.LEAGUE.ALREADY_SIGNED_UP.code,
      });
      expect(teamRepo.create).not.toHaveBeenCalled();
      expect(coachRepo.create).not.toHaveBeenCalled();
    });

    it("records a pending application and creates no team or coach", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      const applicationId = new Types.ObjectId();
      applicationRepo.create.mockResolvedValue({
        _id: applicationId,
        status: "pending",
      } as any);

      const dto = buildSignUpDto();
      const result = await service.createSignup(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
        dto,
      );

      expect(applicationRepo.create).toHaveBeenCalledTimes(1);
      expect(applicationRepo.create.mock.calls[0][0]).toMatchObject({
        tournamentId: tournament.id,
        auth0Id: SUB,
        name: dto.name,
        gameName: dto.gameName,
        discordName: dto.discordName,
        timezone: dto.timezone,
        experience: "5 years of competitive Pokemon",
        droppedBefore: false,
        confirmed: dto.confirm,
        preferredTeamName: dto.teamName,
        preferredLogo: dto.logo,
        intent: "team",
        status: "pending",
      });

      expect(teamRepo.create).not.toHaveBeenCalled();
      expect(coachRepo.create).not.toHaveBeenCalled();

      expect(result).toEqual({
        message: "Sign up successful.",
        applicationId: applicationId.toString(),
        tournamentId: tournament.id,
        status: "pending",
      });

      expect(events.emit).toHaveBeenCalledWith(
        "tournament.application.submitted",
        expect.objectContaining({ tournament, signUp: dto }),
      );
      expect(discordService.sendMessage).not.toHaveBeenCalled();
    });

    it("claims the logo as the applicant's own team-logo upload", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      applicationRepo.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: "pending",
      } as any);

      await service.createSignup(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
        buildSignUpDto({ logo: "team-logos/mine.png" }),
      );

      expect(uploads.claimUpload).toHaveBeenCalledWith("team-logos/mine.png", {
        uploadedBy: SUB,
        folder: UploadFolder.TEAM_LOGOS,
        relatedEntityId: tournament.id,
      });
    });

    it("refuses a logo the applicant can't claim and records nothing", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      uploads.claimUpload.mockRejectedValue(
        Object.assign(new Error("File not found"), { code: "FILE-003" }),
      );

      await expect(
        service.createSignup(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          SUB,
          buildSignUpDto({ logo: "team-logos/someone-elses.png" }),
        ),
      ).rejects.toMatchObject({ code: "FILE-003" });
      expect(applicationRepo.create).not.toHaveBeenCalled();
    });

    it("does not seat a coach at sign-up time", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      applicationRepo.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: "pending",
      } as any);

      await service.createSignup(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
        buildSignUpDto(),
      );

      expect(events.emit).not.toHaveBeenCalledWith(
        "tournament.coach.seated",
        expect.anything(),
      );
    });

    it("rejects a second signup when an undecided application exists", async () => {
      applicationRepo.findBlockingApplication.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: "pending",
      } as any);

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).rejects.toMatchObject({
        code: ErrorCodes.LEAGUE.ALREADY_SIGNED_UP.code,
      });

      expect(applicationRepo.create).not.toHaveBeenCalled();
    });

    it("announces nothing when the application isn't recorded", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      applicationRepo.create.mockRejectedValue(new Error("write failed"));

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).rejects.toThrow("write failed");

      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe("decideApplication", () => {
    const APPLICATION_ID = new Types.ObjectId();

    function buildApplication(overrides: Record<string, unknown> = {}) {
      return {
        _id: APPLICATION_ID,
        tournamentId: tournament.id,
        auth0Id: SUB,
        name: "Ash Ketchum",
        gameName: "AshK",
        discordName: "ash#1234",
        timezone: "America/Los_Angeles",
        experience: "5 years",
        droppedBefore: false,
        droppedWhy: undefined,
        confirmed: true,
        preferredTeamName: "Team Rocket",
        preferredLogo: undefined,
        intent: "team",
        status: "pending",
        ...overrides,
      } as any;
    }

    beforeEach(() => {
      tournament = buildTournament({ staff: [{ sub: SUB, role: "organizer" }] });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);
      applicationRepo.decide.mockImplementation(
        async (_id, data) => ({ ...data }) as any,
      );
    });

    it("rejects a decision from someone who is not an organizer", async () => {
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());

      await expect(
        service.decideApplication(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          APPLICATION_ID.toString(),
          "auth0|stranger",
          { status: "approved" },
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
    });

    it("creates the team and coach on approval, linked both ways", async () => {
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());
      teamRepo.create.mockImplementation(async (input) =>
        buildCreatedTeam(input._id),
      );
      coachRepo.create.mockImplementation(async (input) => input as any);

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "approved" },
      );

      const teamInput = teamRepo.create.mock.calls[0][0];
      const coachInput = coachRepo.create.mock.calls[0][0];

      expect(teamInput).toMatchObject({
        tournamentId: tournament.id,
        teamName: "Team Rocket",
        status: "approved",
      });
      expect(coachInput).toMatchObject({ auth0Id: SUB, name: "Ash Ketchum" });
      expect(teamInput!.coach).toEqual(coachInput!._id);
      expect(coachInput!.teamId).toEqual(teamInput!._id);

      expect(applicationRepo.decide).toHaveBeenCalledWith(
        APPLICATION_ID.toString(),
        expect.objectContaining({ status: "approved", decidedBy: SUB }),
      );
    });

    it("announces the seated coach on approval, without waiting on Discord", async () => {
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());
      teamRepo.create.mockResolvedValue(buildCreatedTeam());
      coachRepo.create.mockResolvedValue({ _id: new Types.ObjectId() } as any);

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "approved" },
      );

      expect(events.emit).toHaveBeenCalledWith("tournament.coach.seated", {
        tournament,
        discordName: "ash#1234",
      });
      expect(discordService.findMember).not.toHaveBeenCalled();
      expect(discordService.grantRole).not.toHaveBeenCalled();
    });

    it("seats nobody when denying", async () => {
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "denied" },
      );

      expect(events.emit).not.toHaveBeenCalled();
    });

    it("creates no team when denying", async () => {
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "denied" },
      );

      expect(teamRepo.create).not.toHaveBeenCalled();
      expect(coachRepo.create).not.toHaveBeenCalled();
    });

    it("creates no team when approving a sub", async () => {
      applicationRepo.findInTournament.mockResolvedValue(
        buildApplication({ intent: "sub" }),
      );

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "approved" },
      );

      expect(teamRepo.create).not.toHaveBeenCalled();
    });

    it("does not create a second team when re-approving", async () => {
      applicationRepo.findInTournament.mockResolvedValue(
        buildApplication({
          status: "approved",
          resultingTeamId: new Types.ObjectId(),
        }),
      );

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "approved" },
      );

      expect(teamRepo.create).not.toHaveBeenCalled();
    });

    it("refuses to deny an application that already has a team", async () => {
      applicationRepo.findInTournament.mockResolvedValue(
        buildApplication({
          status: "approved",
          resultingTeamId: new Types.ObjectId(),
        }),
      );

      await expect(
        service.decideApplication(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          APPLICATION_ID.toString(),
          SUB,
          { status: "denied" },
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LEAGUE.APPLICATION_HAS_TEAM.code,
      });

      expect(applicationRepo.decide).not.toHaveBeenCalled();
    });

    it("refuses to approve past maxTeams", async () => {
      tournament = buildTournament({ staff: [{ sub: SUB, role: "organizer" }], maxTeams: 8 });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());
      teamRepo.countApprovedByTournament.mockResolvedValue(8);

      await expect(
        service.decideApplication(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          APPLICATION_ID.toString(),
          SUB,
          { status: "approved" },
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LEAGUE.TOURNAMENT_FULL.code,
      });

      expect(teamRepo.create).not.toHaveBeenCalled();
    });

    it("bumps the roster version first inside the transaction when there is a cap", async () => {
      const { track, log } = transactions;
      tournament = buildTournament({ staff: [{ sub: SUB, role: "organizer" }], maxTeams: 8 });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());
      tournamentRepo.bumpRosterVersion.mockImplementation(
        track("tournament.bumpRosterVersion", () => undefined),
      );
      teamRepo.countApprovedByTournament.mockImplementation(
        track("team.countApproved", () => 3),
      );
      teamRepo.create.mockImplementation(
        track("team.create", (input) => buildCreatedTeam(input._id)),
      );
      coachRepo.create.mockResolvedValue({ _id: new Types.ObjectId() } as any);

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "approved" },
      );

      expect(log.slice(0, 4)).toEqual([
        "begin",
        "tournament.bumpRosterVersion",
        "team.countApproved",
        "team.create",
      ]);
    });

    it("writes the team, coach and decision in one transaction, then announces the seat", async () => {
      const { track, log } = transactions;
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());
      teamRepo.create.mockImplementation(
        track("team.create", (input) => buildCreatedTeam(input._id)),
      );
      coachRepo.create.mockImplementation(
        track("coach.create", (input) => input as any),
      );
      applicationRepo.decide.mockImplementation(
        track("application.decide", (_id, data) => ({ ...data }) as any),
      );
      events.emit.mockImplementation((name) => {
        log.push(String(name));
        return true;
      });

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "approved" },
      );

      expect(log).toEqual([
        "begin",
        "team.create",
        "coach.create",
        "application.decide",
        "commit",
        "tournament.coach.seated",
      ]);
    });

    it("aborts and grants no role when a write fails partway", async () => {
      const { track, log } = transactions;
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());
      teamRepo.create.mockImplementation(
        track("team.create", (input) => buildCreatedTeam(input._id)),
      );
      coachRepo.create.mockRejectedValue(new Error("write failed"));

      await expect(
        service.decideApplication(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          APPLICATION_ID.toString(),
          SUB,
          { status: "approved" },
        ),
      ).rejects.toThrow("write failed");

      expect(log).toEqual(["begin", "team.create", "abort"]);
      expect(applicationRepo.decide).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it("retires the old coach and seats the new one in one transaction", async () => {
      const { track, log } = transactions;
      const teamId = new Types.ObjectId();
      const outgoingId = new Types.ObjectId();

      teamRepo.findBySlug = jest.fn().mockResolvedValue({
        _id: teamId,
        slug: "team-rocket-a1b2",
        tournamentId: tournament.id,
        teamName: "Team Rocket",
        primaryCoach: { _id: outgoingId },
      });
      coachRepo.findAllByTeam = jest
        .fn()
        .mockResolvedValue([{ _id: outgoingId, leftAt: undefined }]);
      coachRepo.update = jest.fn(
        track("coach.update", () => ({}) as any),
      ) as any;
      coachRepo.create.mockImplementation(
        track("coach.create", () => ({ _id: new Types.ObjectId() }) as any),
      );
      teamRepo.replaceCoach = jest.fn(
        track("team.replaceCoach", () => ({
          _id: teamId,
          slug: "team-rocket-a1b2",
          teamName: "Team Rocket",
        })),
      ) as any;
      applicationRepo.decide.mockImplementation(
        track("application.decide", () => ({}) as any),
      );
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());

      await service.replaceCoach(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "team-rocket-a1b2",
        SUB,
        { applicationId: APPLICATION_ID.toString() },
      );

      expect(log).toEqual([
        "begin",
        "coach.update",
        "coach.create",
        "team.replaceCoach",
        "application.decide",
        "commit",
      ]);
    });

    it("replaces the coach, renames the team and logs the rename", async () => {
      const teamId = new Types.ObjectId();
      const outgoingId = new Types.ObjectId();
      const incomingId = new Types.ObjectId();

      teamRepo.findBySlug = jest.fn().mockResolvedValue({
        _id: teamId,
        slug: "team-rocket-a1b2",
        tournamentId: tournament.id,
        teamName: "Old Name",
        logo: "old-logo",
        primaryCoach: { _id: outgoingId },
      });
      coachRepo.findAllByTeam = jest
        .fn()
        .mockResolvedValue([{ _id: outgoingId, leftAt: undefined }]);
      coachRepo.update = jest.fn().mockResolvedValue({});
      coachRepo.create.mockResolvedValue({ _id: incomingId } as any);
      applicationRepo.findInTournament.mockResolvedValue(
        buildApplication({
          preferredTeamName: "Storm Crows",
          preferredLogo: "new-logo",
        }),
      );
      teamRepo.replaceCoach = jest.fn().mockResolvedValue({
        _id: teamId,
        slug: "team-rocket-a1b2",
        teamName: "Storm Crows",
      });

      const result = await service.replaceCoach(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "team-rocket-a1b2",
        SUB,
        { applicationId: APPLICATION_ID.toString() },
      );

      expect(coachRepo.update).toHaveBeenCalledWith(
        outgoingId,
        expect.objectContaining({ leftAt: expect.any(Date) }),
      );

      const replaceArgs = (teamRepo.replaceCoach as jest.Mock).mock.calls[0][1];
      expect(replaceArgs).toMatchObject({
        primaryCoach: incomingId,
        teamName: "Storm Crows",
        logo: "new-logo",
      });
      expect(replaceArgs.nameChange).toMatchObject({
        from: "Old Name",
        to: "Storm Crows",
        changedBy: SUB,
      });

      expect(applicationRepo.decide).toHaveBeenCalledWith(
        APPLICATION_ID,
        expect.objectContaining({
          status: "approved",
          resultingTeamId: teamId,
          resultingCoachId: incomingId,
        }),
      );

      expect(result.renamedFrom).toBe("Old Name");
    });

    it("logs no rename when the name is unchanged", async () => {
      const teamId = new Types.ObjectId();
      teamRepo.findBySlug = jest.fn().mockResolvedValue({
        _id: teamId,
        slug: "same",
        tournamentId: tournament.id,
        teamName: "Same Name",
        primaryCoach: { _id: new Types.ObjectId() },
      });
      coachRepo.findAllByTeam = jest.fn().mockResolvedValue([]);
      coachRepo.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      } as any);
      applicationRepo.findInTournament.mockResolvedValue(
        buildApplication({ preferredTeamName: "Same Name" }),
      );
      teamRepo.replaceCoach = jest
        .fn()
        .mockResolvedValue({ _id: teamId, slug: "same", teamName: "Same Name" });

      const result = await service.replaceCoach(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "same",
        SUB,
        { applicationId: APPLICATION_ID.toString() },
      );

      const replaceArgs = (teamRepo.replaceCoach as jest.Mock).mock.calls[0][1];
      expect(replaceArgs.nameChange).toBeUndefined();
      expect(result.renamedFrom).toBeNull();
    });

    it("refuses an application that already produced a coach", async () => {
      teamRepo.findBySlug = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        slug: "team",
        tournamentId: tournament.id,
        teamName: "Team",
        primaryCoach: { _id: new Types.ObjectId() },
      });
      applicationRepo.findInTournament.mockResolvedValue(
        buildApplication({ resultingCoachId: new Types.ObjectId() }),
      );

      await expect(
        service.replaceCoach(LEAGUE_KEY, TOURNAMENT_KEY, "team", SUB, {
          applicationId: APPLICATION_ID.toString(),
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.LEAGUE.ALREADY_SIGNED_UP.code,
      });
    });

    it("uses the organizer's team name override when given", async () => {
      applicationRepo.findInTournament.mockResolvedValue(buildApplication());
      teamRepo.create.mockResolvedValue(buildCreatedTeam());
      coachRepo.create.mockResolvedValue({ _id: new Types.ObjectId() } as any);

      await service.decideApplication(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        APPLICATION_ID.toString(),
        SUB,
        { status: "approved", teamName: "Renamed Squad" },
      );

      expect(teamRepo.create.mock.calls[0][0]).toMatchObject({
        teamName: "Renamed Squad",
      });
    });
  });
});

function buildSettingsTierList(
  overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {},
) {
  return new TierList({
    id: "tier-1",
    slug: "tier1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map(),
    tiers: [new Tier({ id: tierId("S"), name: "S", cost: 10 }), new Tier({ id: tierId("A"), name: "A", cost: 5 })],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

describe("HostedTournamentService removeParticipant", () => {
  const ORGANIZER = "auth0|organizer";
  const TEAM_ID = new Types.ObjectId();
  const COACH_ID = new Types.ObjectId();

  let transactions: ReturnType<typeof recordTransactions>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let applicationRepo: jest.Mocked<TournamentApplicationRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let service: HostedTournamentService;

  beforeEach(() => {
    transactions = recordTransactions();
    const { track } = transactions;
    const tournament = buildTournament({
      staff: [{ sub: ORGANIZER, role: "organizer" }],
    });

    teamRepo = {
      findByIdOrNull: jest
        .fn()
        .mockResolvedValue({ _id: TEAM_ID, tournamentId: tournament.id }),
      delete: jest.fn(track("team.delete", () => undefined)),
    } as unknown as jest.Mocked<TeamRepository>;
    coachRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ _id: COACH_ID, teamId: TEAM_ID, leftAt: undefined }),
      deleteAllByTeam: jest.fn(track("coach.deleteAllByTeam", () => 1)),
    } as unknown as jest.Mocked<CoachRepository>;
    applicationRepo = {
      denyAllForTeam: jest.fn(track("application.denyAllForTeam", () => 1)),
    } as unknown as jest.Mocked<TournamentApplicationRepository>;
    matchupRepo = {
      findByStages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;

    service = new HostedTournamentService(
      {
        findBySlug: jest.fn().mockResolvedValue(tournament),
      } as unknown as HostedTournamentRepository,
      {} as TierListRepository,
      teamRepo,
      coachRepo,
      applicationRepo,
      {} as DraftRepository,
      {
        findAllByTournament: jest.fn().mockResolvedValue([]),
      } as unknown as StageRepository,
      matchupRepo,
      {} as DiscordService,
      {} as S3Service,
      {} as UploadsService,
      transactions.runner,
      silentEvents,
    );
  });

  it("deletes the team and its coaches and denies its applications, in one transaction", async () => {
    await service.removeParticipant(
      LEAGUE_KEY,
      TOURNAMENT_KEY,
      ORGANIZER,
      COACH_ID.toString(),
    );

    expect(transactions.log).toEqual([
      "begin",
      "team.delete",
      "coach.deleteAllByTeam",
      "application.denyAllForTeam",
      "commit",
    ]);
    expect(coachRepo.deleteAllByTeam).toHaveBeenCalledWith(TEAM_ID);
    expect(applicationRepo.denyAllForTeam).toHaveBeenCalledWith(
      TEAM_ID,
      ORGANIZER,
    );
  });

  it("refuses a coach who has already left the team", async () => {
    coachRepo.findById.mockResolvedValue({
      _id: COACH_ID,
      teamId: TEAM_ID,
      leftAt: new Date(),
    } as any);

    await expect(
      service.removeParticipant(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        ORGANIZER,
        COACH_ID.toString(),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.COACH_NOT_FOUND.code });

    expect(transactions.log).toEqual([]);
  });

  it("refuses a team that has played", async () => {
    matchupRepo.findByStages.mockResolvedValue([{ _id: "m1" }] as any);

    await expect(
      service.removeParticipant(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        ORGANIZER,
        COACH_ID.toString(),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.COACH_HAS_MATCHES.code });

    expect(transactions.log).toEqual([]);
  });
});

describe("HostedTournamentService settings", () => {
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let discordService: jest.Mocked<DiscordService>;
  let uploads: jest.Mocked<UploadsService>;
  let service: HostedTournamentService;
  let tournament: HostedTournament;

  beforeEach(() => {
    tournament = buildTournament({ logo: "tournament-logos/current.png" });

    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(tournament),
      updateSettings: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = {
      findById: jest.fn().mockResolvedValue(buildSettingsTierList()),
    } as unknown as jest.Mocked<TierListRepository>;
    discordService = {
      findTargetProblems: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DiscordService>;
    uploads = {
      claimUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UploadsService>;

    service = new HostedTournamentService(
      tournamentRepo,
      tierListRepo,
      {} as TeamRepository,
      {} as CoachRepository,
      {} as TournamentApplicationRepository,
      {} as DraftRepository,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      discordService,
      {} as S3Service,
      uploads,
      inlineTransactions,
      silentEvents,
    );
  });

  describe("standings rules", () => {
    it("stores points and the tiebreaker order", async () => {
      await service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
        standingsRules: {
          points: { win: 2, draw: 1, loss: 0 },
          tiebreakers: ["headToHead", "gameDiff"],
        },
      });

      expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
        tournament.id,
        expect.objectContaining({
          "standingsRules.points": { win: 2, draw: 1, loss: 0 },
          "standingsRules.tiebreakers": ["headToHead", "gameDiff"],
        }),
      );
    });

    it.each([
      ["a draw worth more than a win", { win: 1, draw: 2, loss: 0 }],
      ["a loss worth more than a draw", { win: 3, draw: 0, loss: 1 }],
    ])("refuses %s and saves nothing", async (_, points) => {
      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          standingsRules: { points },
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("reports the effective rules, derived from the diff mode until customized", async () => {
      const settings = await service.getSettings(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "auth0|owner",
      );

      expect(settings).toMatchObject({
        standingsRules: {
          points: { win: 3, draw: 1, loss: 0 },
          tiebreakers: ["pokemonDiff", "gameDiff", "headToHead"],
        },
        standingsRulesCustomized: false,
      });
    });
  });

  describe("logo", () => {
    it("claims a new logo as the organizer's own tournament-logo upload", async () => {
      await service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
        logo: "tournament-logos/new.png",
      });

      expect(uploads.claimUpload).toHaveBeenCalledWith(
        "tournament-logos/new.png",
        {
          uploadedBy: "auth0|owner",
          folder: UploadFolder.TOURNAMENT_LOGOS,
          relatedEntityId: tournament.id,
        },
      );
      expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
        tournament.id,
        expect.objectContaining({ logo: "tournament-logos/new.png" }),
      );
    });

    it("does not re-claim the logo the tournament already has", async () => {
      await service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
        logo: "tournament-logos/current.png",
      });

      expect(uploads.claimUpload).not.toHaveBeenCalled();
    });

    it("clears the logo without claiming anything", async () => {
      await service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
        logo: null,
      });

      expect(uploads.claimUpload).not.toHaveBeenCalled();
      expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
        tournament.id,
        expect.objectContaining({ logo: null }),
      );
    });

    it("saves nothing when the logo can't be claimed", async () => {
      uploads.claimUpload.mockRejectedValue(
        Object.assign(new Error("File not found"), { code: "FILE-003" }),
      );

      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          logo: "team-logos/not-mine.png",
        }),
      ).rejects.toMatchObject({ code: "FILE-003" });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });
  });

  describe("getSettings", () => {
    it("throws FORBIDDEN for a non-organizer", async () => {
      await expect(
        service.getSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|stranger"),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
    });

    it("returns the current settings for the organizer", async () => {
      const result = await service.getSettings(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "auth0|owner",
      );

      expect(result).toMatchObject({
        tierListId: "tier-1",
        format: "Singles",
        ruleset: "Gen9 NatDex",
        draftCount: { min: 1, max: 6 },
      });
    });
  });

  describe("updateSettings", () => {
    it("throws FORBIDDEN for a non-organizer", async () => {
      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|stranger", {}),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("validates the role and channel against the linked server, and saves nothing on a problem", async () => {
      discordService.findTargetProblems.mockResolvedValue([
        "The coach role can't be used: it carries moderator or admin permissions.",
      ]);
      const discordSettings = {
        coachRoleId: "222222222222222222",
        signUpChannelId: "333333333333333333",
      };

      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          discordSettings,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
      expect(discordService.findTargetProblems).toHaveBeenCalledWith({
        guildId: "guild-1",
        roleId: discordSettings.coachRoleId,
        channelIds: [discordSettings.signUpChannelId],
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("writes only the editable Discord fields, never the linked server", async () => {
      await service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
        discordSettings: {
          guildId: "999999999999999999",
          coachRoleId: "222222222222222222",
          autoGrantCoachRole: false,
        } as never,
      });

      const [, update] = tournamentRepo.updateSettings.mock.calls[0];
      expect(update).toEqual({
        "discordSettings.coachRoleId": "222222222222222222",
        "discordSettings.signUpChannelId": null,
        "discordSettings.autoGrantCoachRole": false,
      });
    });

    it("rejects tierRequirements before a tier list is attached", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ tierListId: "", format: null, ruleset: null }),
      );

      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          tierRequirements: [{ tierId: tierId("Tier A"), required: 1 }],
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.TIER_LIST_REQUIRED.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("saves settings that don't depend on a tier list before one is attached", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ tierListId: "", format: null, ruleset: null }),
      );

      await service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
        name: "Summer Cup",
      });

      expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
        "tournament-1",
        expect.objectContaining({ name: "Summer Cup" }),
      );
    });

    it("rejects tierRequirements naming a tier that doesn't exist on the tier list", async () => {
      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          tierRequirements: [{ tierId: tierId("Nonexistent"), required: 1 }],
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects tierRequirements whose total exceeds the effective roster max", async () => {
      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          draftCount: { min: 1, max: 2 },
          tierRequirements: [{ tierId: tierId("S"), required: 3 }],
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects switching tier lists when the saved requirements name tiers the new list lacks", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          tierRequirements: [
            new TierRequirement({ tierId: tierId("Nonexistent"), required: 1 }),
          ],
        }),
      );

      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          tierListId: new Types.ObjectId().toString(),
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects lowering the roster max below the saved requirements", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          tierRequirements: [
            new TierRequirement({ tierId: tierId("S"), required: 3 }),
          ],
        }),
      );

      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          draftCount: { min: 1, max: 2 },
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects a roster minimum above the maximum", async () => {
      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          draftCount: { min: 8, max: 6 },
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
    });

    it("does not load the tier list for a save that touches no roster rule", async () => {
      await service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
        name: "Summer Cup",
      });

      expect(tierListRepo.findById).not.toHaveBeenCalled();
      expect(tournamentRepo.updateSettings).toHaveBeenCalled();
    });

    it("persists only the provided keys on a valid update", async () => {
      const result = await service.updateSettings(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "auth0|owner",
        { pointTotal: 100, tierRequirements: [{ tierId: tierId("S"), required: 1 }] },
      );

      expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
        tournament.id,
        {
          pointTotal: 100,
          tierRequirements: [{ tierId: tierId("S"), required: 1 }],
        },
      );
      expect(result).toEqual({ success: true });
    });
  });
});

describe("HostedTournamentService coach details", () => {
  const COACH_ID = new Types.ObjectId();
  const TEAM_ID = new Types.ObjectId();

  let coachRepo: jest.Mocked<CoachRepository>;
  let applicationRepo: jest.Mocked<TournamentApplicationRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let service: HostedTournamentService;

  beforeEach(() => {
    const tournament = buildTournament();
    coachRepo = {
      findById: jest.fn().mockResolvedValue({
        _id: COACH_ID,
        auth0Id: "auth0|coach",
        teamId: TEAM_ID,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CoachRepository>;
    applicationRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
      findBlockingApplication: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<TournamentApplicationRepository>;
    teamRepo = {
      findByIdOrNull: jest.fn().mockResolvedValue({
        _id: TEAM_ID,
        tournamentId: { toString: () => tournament.id },
      }),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TeamRepository>;

    service = new HostedTournamentService(
      {
        findBySlug: jest.fn().mockResolvedValue(tournament),
      } as unknown as HostedTournamentRepository,
      {} as TierListRepository,
      teamRepo,
      coachRepo,
      applicationRepo,
      {} as DraftRepository,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      {} as DiscordService,
      {} as S3Service,
      {} as UploadsService,
      inlineTransactions,
      silentEvents,
    );
  });

  it("throws FORBIDDEN for someone who is neither organizer nor the coach", async () => {
    await expect(
      service.updateCoachDetails(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        COACH_ID.toString(),
        "auth0|stranger",
        { name: "New Name" },
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
    expect(coachRepo.update).not.toHaveBeenCalled();
    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN for a coach who has left the team", async () => {
    coachRepo.findById.mockResolvedValue({
      _id: COACH_ID,
      auth0Id: "auth0|coach",
      teamId: TEAM_ID,
      leftAt: new Date(),
    } as never);

    await expect(
      service.updateCoachDetails(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        COACH_ID.toString(),
        "auth0|coach",
        { timezone: "UTC+1" },
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
    expect(coachRepo.update).not.toHaveBeenCalled();
  });

  it("lets the coach edit their own details", async () => {
    await service.updateCoachDetails(
      LEAGUE_KEY,
      TOURNAMENT_KEY,
      COACH_ID.toString(),
      "auth0|coach",
      { timezone: "UTC+1" },
    );

    expect(coachRepo.update).toHaveBeenCalledWith(COACH_ID, {
      timezone: "UTC+1",
    });
  });

  it("lets an organizer edit a coach's details", async () => {
    await service.updateCoachDetails(
      LEAGUE_KEY,
      TOURNAMENT_KEY,
      COACH_ID.toString(),
      "auth0|owner",
      { name: "Ash" },
    );

    expect(coachRepo.update).toHaveBeenCalledWith(COACH_ID, { name: "Ash" });
    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("writes nothing when the payload is empty", async () => {
    await service.updateCoachDetails(
      LEAGUE_KEY,
      TOURNAMENT_KEY,
      COACH_ID.toString(),
      "auth0|owner",
      {},
    );

    expect(coachRepo.update).not.toHaveBeenCalled();
    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("refuses a coach whose team belongs to another tournament", async () => {
    teamRepo.findByIdOrNull.mockResolvedValue({
      _id: TEAM_ID,
      tournamentId: { toString: () => "another-tournament" },
    } as never);

    await expect(
      service.updateCoachDetails(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        COACH_ID.toString(),
        "auth0|owner",
        { name: "Ash" },
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.COACH_NOT_FOUND.code });
  });
});

describe("HostedTournamentService updateTeam", () => {
  const TEAM_ID = new Types.ObjectId();
  const ROUND_ID = new Types.ObjectId();

  let teamRepo: jest.Mocked<TeamRepository>;
  let uploads: jest.Mocked<UploadsService>;
  let service: HostedTournamentService;

  function coach(auth0Id: string, leftAt?: Date) {
    return { _id: new Types.ObjectId(), auth0Id, name: auth0Id, leftAt };
  }

  beforeEach(() => {
    const tournament = buildTournament({
      rounds: [{ _id: ROUND_ID, name: "Week 1" }] as any,
      currentRoundIndex: 0,
    });
    const primary = coach("auth0|primary");
    uploads = {
      claimUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UploadsService>;
    teamRepo = {
      findBySlug: jest.fn().mockResolvedValue({
        _id: TEAM_ID,
        slug: "team-rocket",
        teamName: "Team Rocket",
        logo: "team-logos/current.png",
        primaryCoach: primary,
        coaches: [
          primary,
          coach("auth0|co-coach"),
          coach("auth0|former", new Date()),
        ],
      }),
      update: jest.fn(async (_id, data: { teamName?: string; logo?: string }) => ({
        teamName: data.teamName ?? "Team Rocket",
        logo: data.logo ?? "team-logos/current.png",
      })),
    } as unknown as jest.Mocked<TeamRepository>;

    service = new HostedTournamentService(
      {
        findBySlug: jest.fn().mockResolvedValue(tournament),
      } as unknown as HostedTournamentRepository,
      {} as TierListRepository,
      teamRepo,
      {} as CoachRepository,
      {} as TournamentApplicationRepository,
      {} as DraftRepository,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      {} as DiscordService,
      {} as S3Service,
      uploads,
      inlineTransactions,
      silentEvents,
    );
  });

  it.each([
    ["the primary coach", "auth0|primary"],
    ["a co-coach", "auth0|co-coach"],
    ["an organizer", "auth0|owner"],
  ])("lets %s rename the team, recording the change", async (_, sub) => {
    const result = await service.updateTeam(
      LEAGUE_KEY,
      TOURNAMENT_KEY,
      "team-rocket",
      sub,
      { teamName: "Team Aqua" },
    );

    expect(teamRepo.update).toHaveBeenCalledWith(TEAM_ID, {
      teamName: "Team Aqua",
      nameChange: {
        from: "Team Rocket",
        to: "Team Aqua",
        roundId: ROUND_ID,
        reason: "Renamed",
        changedBy: sub,
      },
    });
    expect(result.teamName).toBe("Team Aqua");
  });

  it.each([
    ["a stranger", "auth0|stranger"],
    ["a coach who has left", "auth0|former"],
  ])("refuses %s", async (_, sub) => {
    await expect(
      service.updateTeam(LEAGUE_KEY, TOURNAMENT_KEY, "team-rocket", sub, {
        teamName: "Takeover",
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("claims a new logo as the caller's own team-logo upload", async () => {
    await service.updateTeam(
      LEAGUE_KEY,
      TOURNAMENT_KEY,
      "team-rocket",
      "auth0|co-coach",
      { logo: "team-logos/new.png" },
    );

    expect(uploads.claimUpload).toHaveBeenCalledWith("team-logos/new.png", {
      uploadedBy: "auth0|co-coach",
      folder: UploadFolder.TEAM_LOGOS,
      relatedEntityId: TEAM_ID.toString(),
    });
    expect(teamRepo.update).toHaveBeenCalledWith(TEAM_ID, {
      logo: "team-logos/new.png",
    });
  });

  it("leaves the team alone when the logo can't be claimed", async () => {
    uploads.claimUpload.mockRejectedValue(
      Object.assign(new Error("File not found"), { code: "FILE-003" }),
    );

    await expect(
      service.updateTeam(LEAGUE_KEY, TOURNAMENT_KEY, "team-rocket", "auth0|primary", {
        teamName: "Team Aqua",
        logo: "team-logos/someone-elses.png",
      }),
    ).rejects.toMatchObject({ code: "FILE-003" });
    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("writes nothing when neither the name nor the logo changed", async () => {
    const result = await service.updateTeam(
      LEAGUE_KEY,
      TOURNAMENT_KEY,
      "team-rocket",
      "auth0|primary",
      { teamName: "Team Rocket", logo: "team-logos/current.png" },
    );

    expect(uploads.claimUpload).not.toHaveBeenCalled();
    expect(teamRepo.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      teamName: "Team Rocket",
      logo: "team-logos/current.png",
    });
  });
});

describe("HostedTournamentService assignTeams", () => {
  const ORGANIZER = "auth0|owner";
  const POOL_ID = new Types.ObjectId();

  let tournament: HostedTournament;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let service: HostedTournamentService;
  let teams: { _id: Types.ObjectId; slug: string; status: string }[];

  function addTeam(status: string) {
    const team = {
      _id: new Types.ObjectId(),
      slug: `team-${teams.length + 1}`,
      status,
    };
    teams.push(team);
    return team;
  }

  beforeEach(() => {
    tournament = buildTournament({ maxTeams: 2 });
    teams = [];

    teamRepo = {
      findAllByTournament: jest.fn(async () => teams),
      countApprovedByTournament: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TeamRepository>;
    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(tournament),
      bumpRosterVersion: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;

    service = new HostedTournamentService(
      tournamentRepo,
      {} as TierListRepository,
      teamRepo,
      {} as CoachRepository,
      {} as TournamentApplicationRepository,
      {
        findAllByTournament: jest
          .fn()
          .mockResolvedValue([{ _id: POOL_ID, slug: "pool-a" }]),
      } as unknown as DraftRepository,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      {} as DiscordService,
      {} as S3Service,
      {} as UploadsService,
      inlineTransactions,
      silentEvents,
    );
  });

  it("moves a team into a pool", async () => {
    const team = addTeam("approved");

    await service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
      { teamSlug: team.slug, divisionKey: "pool-a", status: "approved" },
    ]);

    expect(teamRepo.update).toHaveBeenCalledWith(team._id, {
      draftId: POOL_ID,
      status: "approved",
    });
  });

  it("looks the teams up once, not once per assignment", async () => {
    const first = addTeam("approved");
    const second = addTeam("approved");

    await service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
      { teamSlug: first.slug, divisionKey: "pool-a", status: "approved" },
      { teamSlug: second.slug, divisionKey: "pool-a", status: "approved" },
    ]);

    expect(teamRepo.findAllByTournament).toHaveBeenCalledTimes(1);
    expect(teamRepo.findAllByTournament).toHaveBeenCalledWith(tournament.id);
  });

  it("writes nothing and names the teams it could not resolve", async () => {
    const known = addTeam("approved");

    await expect(
      service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
        { teamSlug: known.slug, divisionKey: "pool-a", status: "approved" },
        { teamSlug: "other-tournaments-team", status: "approved" },
      ]),
    ).rejects.toMatchObject({
      code: ErrorCodes.LEAGUE.ASSIGNMENT_TEAMS_NOT_FOUND.code,
      details: { teamSlugs: ["other-tournaments-team"] },
    });

    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("writes nothing when a pool does not exist, even after valid entries", async () => {
    const first = addTeam("approved");
    const second = addTeam("approved");

    await expect(
      service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
        { teamSlug: first.slug, divisionKey: "pool-a", status: "approved" },
        { teamSlug: second.slug, divisionKey: "missing-pool", status: "approved" },
      ]),
    ).rejects.toMatchObject({ code: ErrorCodes.DRAFT.NOT_IN_LEAGUE.code });

    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("refuses to reinstate dropped teams past maxTeams", async () => {
    const first = addTeam("dropped");
    const second = addTeam("dropped");

    await expect(
      service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
        { teamSlug: first.slug, status: "approved" },
        { teamSlug: second.slug, status: "approved" },
      ]),
    ).rejects.toMatchObject({ code: ErrorCodes.LEAGUE.TOURNAMENT_FULL.code });

    expect(teamRepo.update).not.toHaveBeenCalled();
  });

  it("reinstates a dropped team while there is room", async () => {
    const team = addTeam("dropped");

    await service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
      { teamSlug: team.slug, status: "approved" },
    ]);

    expect(teamRepo.update).toHaveBeenCalledWith(team._id, {
      draftId: null,
      status: "approved",
    });
  });

  it("bumps the roster version before counting, so concurrent reinstatements conflict", async () => {
    const order: string[] = [];
    tournamentRepo.bumpRosterVersion.mockImplementation(async () => {
      order.push("bump");
    });
    teamRepo.countApprovedByTournament.mockImplementation(async () => {
      order.push("count");
      return 1;
    });
    const team = addTeam("dropped");

    await service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
      { teamSlug: team.slug, status: "approved" },
    ]);

    expect(order).toEqual(["bump", "count"]);
  });

  it("leaves the roster version alone when nothing is reinstated", async () => {
    const team = addTeam("approved");

    await service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
      { teamSlug: team.slug, divisionKey: "pool-a", status: "approved" },
    ]);

    expect(tournamentRepo.bumpRosterVersion).not.toHaveBeenCalled();
  });

  it("does not count an already-approved team against the limit", async () => {
    teamRepo.countApprovedByTournament.mockResolvedValue(2);
    const team = addTeam("approved");

    await service.assignTeams(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, [
      { teamSlug: team.slug, divisionKey: "pool-a", status: "approved" },
    ]);

    expect(teamRepo.countApprovedByTournament).not.toHaveBeenCalled();
    expect(teamRepo.update).toHaveBeenCalledTimes(1);
  });
});

describe("HostedTournamentService teams", () => {
  const TEAM_ID = new Types.ObjectId();
  const OTHER_TEAM_ID = new Types.ObjectId();

  function buildTeam(
    id: Types.ObjectId,
    teamName: string,
    pokemonIds: string[],
  ) {
    const coach = { _id: new Types.ObjectId(), name: `${teamName} coach` };
    return {
      _id: id,
      slug: `${teamName.toLowerCase().replace(/\s+/g, "-")}-slug`,
      teamName,
      status: "approved",
      coach,
      primaryCoach: coach,
      pickLog: pokemonIds.map((pokemonId) => ({ pokemon: { id: pokemonId } })),
    };
  }

  function buildRosterTierList() {
    return buildSettingsTierList({
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
        ["eevee", new TierListPokemon({ name: "Eevee", tierId: tierId("A") })],
        ["snorlax", new TierListPokemon({ name: "Snorlax", tierId: tierId("A") })],
      ]),
    });
  }

  function buildService(overrides: {
    tournament: HostedTournament;
    teams?: unknown[];
    stages?: unknown[];
    team?: unknown;
    drafts?: unknown[];
  }) {
    const tierList = buildRosterTierList();
    const tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(overrides.tournament),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    const tierListRepo = {
      findById: jest.fn().mockResolvedValue(tierList),
    } as unknown as jest.Mocked<TierListRepository>;
    const teamRepo = {
      findAllByTournament: jest.fn().mockResolvedValue(overrides.teams ?? []),
      findById: jest.fn().mockResolvedValue(overrides.team),
      findBySlug: jest.fn().mockResolvedValue(overrides.team),
    } as unknown as jest.Mocked<TeamRepository>;
    const drafts = (overrides.drafts ?? []) as { _id: Types.ObjectId }[];
    const draftRepo = {
      findAllByTournament: jest.fn().mockResolvedValue(drafts),
      findById: jest.fn(async (id: Types.ObjectId) =>
        drafts.find((draft) => draft._id.equals(id)) ?? null,
      ),
      findTournament: jest
        .fn()
        .mockResolvedValue(Object.assign(overrides.tournament, { tierList })),
    } as unknown as jest.Mocked<DraftRepository>;
    const stageRepo = {
      findAllByTournament: jest.fn().mockResolvedValue(overrides.stages ?? []),
      teamIdsInSeedOrder: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<StageRepository>;
    (teamRepo as any).findManyByIds = jest.fn().mockResolvedValue([]);
    const matchupRepo = {
      findByStages: jest.fn().mockResolvedValue([]),
      findByRoundsInStage: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;

    const service = new HostedTournamentService(
      tournamentRepo,
      tierListRepo,
      teamRepo,
      {} as CoachRepository,
      {} as TournamentApplicationRepository,
      draftRepo,
      stageRepo,
      matchupRepo,
      {} as DiscordService,
      {} as S3Service,
      {} as UploadsService,
      inlineTransactions,
      silentEvents,
    );
    return { service, matchupRepo, stageRepo, teamRepo };
  }

  describe("listTeams", () => {
    it("returns each team's picks priced against the tier list", async () => {
      const { service } = buildService({
        tournament: buildTournament(),
        teams: [buildTeam(TEAM_ID, "Team One", ["pikachu", "eevee"])],
      });

      const result = await service.listTeams(LEAGUE_KEY, TOURNAMENT_KEY);

      expect(result.teams[0].roster).toEqual([
        { id: "pikachu", name: "Pikachu", cost: 10, tier: "S" },
        { id: "eevee", name: "Eevee", cost: 5, tier: "A" },
      ]);
    });

    it("applies the tournament's approved trades to the roster it reports", async () => {
      const tournament = buildTournament({
        rounds: [{ _id: new Types.ObjectId(), name: "Week 1" }],
        currentRoundIndex: 0,
        trades: [
          {
            side1: { team: TEAM_ID, pokemon: [{ id: "eevee" }] },
            side2: { team: OTHER_TEAM_ID, pokemon: [{ id: "snorlax" }] },
            timestamp: new Date(),
            activeRound: 0,
            status: "APPROVED",
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const { service } = buildService({
        tournament,
        teams: [buildTeam(TEAM_ID, "Team One", ["pikachu", "eevee"])],
      });

      const result = await service.listTeams(LEAGUE_KEY, TOURNAMENT_KEY);

      expect(result.teams[0].roster.map((p) => p.id)).toEqual([
        "pikachu",
        "snorlax",
      ]);
    });
  });

  describe("blind drafts", () => {
    const DRAFT_ID = new Types.ObjectId();

    function blindDraft(status = "IN_PROGRESS") {
      return {
        _id: DRAFT_ID,
        slug: "pool-a",
        name: "Pool A",
        status,
        picksVisibleTo: "ownTeam",
        allowDuplicates: true,
      };
    }

    function draftedTeam(id: Types.ObjectId, name: string, sub: string) {
      const team = buildTeam(id, name, ["pikachu"]);
      return {
        ...team,
        draftId: DRAFT_ID,
        coaches: [{ ...team.primaryCoach, auth0Id: sub }],
      };
    }

    function blindService(status?: string) {
      const own = draftedTeam(TEAM_ID, "Team One", SUB);
      const rival = draftedTeam(OTHER_TEAM_ID, "Team Two", "auth0|rival");
      return buildService({
        tournament: buildTournament(),
        teams: [own, rival],
        team: rival,
        drafts: [blindDraft(status)],
      }).service;
    }

    it("listTeams empties other teams' rosters for a coach", async () => {
      const result = await blindService().listTeams(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
      );

      expect(
        result.teams.map((team) => [team.picksHidden, team.roster.length]),
      ).toEqual([
        [false, 1],
        [true, 0],
      ]);
      expect(result.teams[1].pickCount).toBe(1);
    });

    it("listTeams hides every roster from a signed-out visitor", async () => {
      const result = await blindService().listTeams(LEAGUE_KEY, TOURNAMENT_KEY);

      expect(result.teams.every((team) => team.picksHidden)).toBe(true);
    });

    it("listTeams shows everything to an organizer and after the draft", async () => {
      const organizer = await blindService().listTeams(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "auth0|owner",
      );
      const finished = await blindService("COMPLETED").listTeams(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
      );

      expect(organizer.teams.some((team) => team.picksHidden)).toBe(false);
      expect(finished.teams.some((team) => team.picksHidden)).toBe(false);
    });

    it("listTeamsByDraft hides rival rosters and reports allowDuplicates", async () => {
      const result = await blindService().listTeamsByDraft(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
      );

      const group = result.drafts.find((entry) => entry.draftSlug === "pool-a")!;
      expect(group.allowDuplicates).toBe(true);
      expect(
        group.teams.map((team) => [team.picksHidden, team.draft.length]),
      ).toEqual([
        [false, 1],
        [true, 0],
      ]);
    });

    it("getTeam hides a rival team's roster", async () => {
      const result = await blindService().getTeam(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "team-two-slug",
        SUB,
      );

      expect(result.picksHidden).toBe(true);
      expect(result.draft).toEqual([]);
    });
  });

  describe("getTeam", () => {
    const visibleStage = { _id: new Types.ObjectId(), order: 0, public: true };
    const hiddenStage = { _id: new Types.ObjectId(), order: 1, public: false };
    const tournamentWithAxis = () =>
      buildTournament({
        rounds: [{ _id: new Types.ObjectId(), name: "Week 1" }],
        currentRoundIndex: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    it("leaves a hidden stage's matchups out for a coach", async () => {
      const { service, matchupRepo } = buildService({
        tournament: tournamentWithAxis(),
        team: buildTeam(TEAM_ID, "Team One", ["pikachu"]),
        stages: [visibleStage, hiddenStage],
      });

      await service.getTeam(LEAGUE_KEY, TOURNAMENT_KEY, "team-one-slug", SUB);

      expect(matchupRepo.findByStages).toHaveBeenCalledWith(
        [visibleStage._id],
        { teamIds: [TEAM_ID] },
      );
    });

    it("includes it for an organizer", async () => {
      const { service, matchupRepo } = buildService({
        tournament: tournamentWithAxis(),
        team: buildTeam(TEAM_ID, "Team One", ["pikachu"]),
        stages: [visibleStage, hiddenStage],
      });

      await service.getTeam(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "team-one-slug",
        "auth0|owner",
      );

      expect(matchupRepo.findByStages).toHaveBeenCalledWith(
        [visibleStage._id, hiddenStage._id],
        { teamIds: [TEAM_ID] },
      );
    });
  });

  describe("getStandings", () => {
    const roundId = new Types.ObjectId();
    const groupStage = {
      _id: new Types.ObjectId(),
      slug: "group-phase",
      name: "Group Phase",
      order: 0,
      public: true,
    };
    const playoffStage = {
      _id: new Types.ObjectId(),
      slug: "playoffs",
      name: "Playoffs",
      order: 1,
      public: true,
    };
    const hiddenStage = {
      _id: new Types.ObjectId(),
      slug: "hidden-stage",
      name: "Hidden Stage",
      order: 2,
      public: false,
    };

    function tournamentWithAxis() {
      return buildTournament({
        rounds: [{ _id: roundId, name: "Week 1" }],
        currentRoundIndex: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }

    it("returns one view per visible stage plus an all view combining every stage's matchups", async () => {
      const teamA = buildTeam(TEAM_ID, "Team A", []);
      const teamB = buildTeam(OTHER_TEAM_ID, "Team B", []);
      const { service, matchupRepo, stageRepo, teamRepo } = buildService({
        tournament: tournamentWithAxis(),
        stages: [groupStage, playoffStage],
      });
      stageRepo.teamIdsInSeedOrder.mockReturnValue([TEAM_ID, OTHER_TEAM_ID]);
      (teamRepo as any).findManyByIds.mockResolvedValue([teamA, teamB]);

      const groupMatchup = {
        side1: { team: teamA, score: 3 },
        side2: { team: teamB, score: 1 },
        round: roundId,
        winner: "side1",
        results: [],
      };
      const playoffMatchup = {
        side1: { team: teamB, score: 2 },
        side2: { team: teamA, score: 0 },
        round: roundId,
        winner: "side1",
        results: [],
      };
      (matchupRepo.findByRoundsInStage as jest.Mock).mockImplementation(
        (stageId: any) => {
          if (stageId === groupStage._id)
            return Promise.resolve([groupMatchup]);
          if (stageId === playoffStage._id)
            return Promise.resolve([playoffMatchup]);
          return Promise.resolve([]);
        },
      );
      matchupRepo.findByStages.mockResolvedValue([
        groupMatchup,
        playoffMatchup,
      ] as any);

      const result = await service.getStandings(LEAGUE_KEY, TOURNAMENT_KEY);

      expect(result.filters).toEqual([
        { value: "all", label: "All Stages" },
        { value: "group-phase", label: "Group Phase" },
        { value: "playoffs", label: "Playoffs" },
      ]);

      const groupTeams = result.views["group-phase"].teamStandings.teams as any[];
      expect(groupTeams.find((t) => t.id === TEAM_ID.toString())).toMatchObject(
        { wins: 1, losses: 0 },
      );
      expect(
        groupTeams.find((t) => t.id === OTHER_TEAM_ID.toString()),
      ).toMatchObject({ wins: 0, losses: 1 });

      const playoffTeams = result.views["playoffs"].teamStandings
        .teams as any[];
      expect(
        playoffTeams.find((t) => t.id === OTHER_TEAM_ID.toString()),
      ).toMatchObject({ wins: 1, losses: 0 });
      expect(
        playoffTeams.find((t) => t.id === TEAM_ID.toString()),
      ).toMatchObject({ wins: 0, losses: 1 });

      const allTeams = result.views["all"].teamStandings.teams as any[];
      expect(allTeams.find((t) => t.id === TEAM_ID.toString())).toMatchObject({
        wins: 1,
        losses: 1,
      });
      expect(
        allTeams.find((t) => t.id === OTHER_TEAM_ID.toString()),
      ).toMatchObject({ wins: 1, losses: 1 });
    });

    it("excludes a hidden stage from filters/views for a non-organizer, includes it for an organizer", async () => {
      const { service: coachService, stageRepo: coachStageRepo } =
        buildService({
          tournament: tournamentWithAxis(),
          stages: [groupStage, hiddenStage],
        });
      coachStageRepo.teamIdsInSeedOrder.mockReturnValue([]);

      const coachResult = await coachService.getStandings(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
      );
      expect(coachResult.filters.map((f) => f.value)).toEqual([
        "all",
        "group-phase",
      ]);
      expect(coachResult.views["hidden-stage"]).toBeUndefined();

      const { service: organizerService, stageRepo: organizerStageRepo } =
        buildService({
          tournament: tournamentWithAxis(),
          stages: [groupStage, hiddenStage],
        });
      organizerStageRepo.teamIdsInSeedOrder.mockReturnValue([]);

      const organizerResult = await organizerService.getStandings(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "auth0|owner",
      );
      expect(organizerResult.filters.map((f) => f.value)).toEqual([
        "all",
        "group-phase",
        "hidden-stage",
      ]);
      expect(organizerResult.views["hidden-stage"]).toBeDefined();
    });
  });
});

describe("HostedTournamentService getInfo", () => {
  const TEAM_ID = new Types.ObjectId();

  let draftRepo: jest.Mocked<DraftRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let service: HostedTournamentService;

  beforeEach(() => {
    const tournament = buildTournament();
    draftRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
      findPublicByTournament: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DraftRepository>;
    teamRepo = {
      findManyByIds: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;

    service = new HostedTournamentService(
      {
        findBySlug: jest.fn().mockResolvedValue(tournament),
      } as unknown as HostedTournamentRepository,
      {} as TierListRepository,
      teamRepo,
      {
        findByAuth0Id: jest.fn().mockResolvedValue([
          { _id: new Types.ObjectId(), auth0Id: "auth0|coach", teamId: TEAM_ID },
        ]),
      } as unknown as CoachRepository,
      {} as TournamentApplicationRepository,
      draftRepo,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      {} as DiscordService,
      {} as S3Service,
      {} as UploadsService,
      inlineTransactions,
      silentEvents,
    );

    teamRepo.findManyByIds.mockImplementation(async () => [
      {
        _id: TEAM_ID,
        tournamentId: { toString: () => tournament.id },
        status: currentStatus,
      },
    ] as never);
  });

  let currentStatus = "approved";

  it("shows every pool to a coach on an approved team", async () => {
    currentStatus = "approved";
    await service.getInfo(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|coach");
    expect(draftRepo.findAllByTournament).toHaveBeenCalled();
    expect(draftRepo.findPublicByTournament).not.toHaveBeenCalled();
  });

  it.each(["dropped", "denied", "pending"])(
    "shows only public pools to a coach whose team is %s",
    async (status) => {
      currentStatus = status;
      await service.getInfo(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|coach");
      expect(draftRepo.findPublicByTournament).toHaveBeenCalled();
      expect(draftRepo.findAllByTournament).not.toHaveBeenCalled();
    },
  );
});
