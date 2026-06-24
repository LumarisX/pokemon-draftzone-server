import { ErrorCodes } from "@core/pdz-error-codes";
import { S3Service } from "@core/storage/s3.service";
import { CoachRepository } from "@modules/coach/coach.repository";
import { DiscordService } from "@modules/discord/discord.service";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Types } from "mongoose";
import { HostedTournament } from "./hosted-tournament.domain";
import { SignUpDto } from "./hosted-tournament.dto";
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
    tournamentKey: TOURNAMENT_KEY,
    signUpDeadline: new Date("2026-01-01"),
    owner: "auth0|owner",
    leagueId: "league-1",
    organizers: [],
    tierListId: "tier-1",
    rules: [],
    stages: [],
    forfeit: { gameDiff: 1, pokemonDiff: 6 },
    diffMode: "pokemon",
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
    experience: "5 years of competitive Pokemon",
    droppedBefore: false,
    droppedWhy: "",
    confirm: true,
    ...overrides,
  };
}

describe("HostedTournamentService signup", () => {
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let discordService: jest.Mocked<DiscordService>;
  let service: HostedTournamentService;
  let tournament: HostedTournament;

  beforeEach(() => {
    tournament = buildTournament();

    tournamentRepo = {
      findByKey: jest.fn().mockResolvedValue(tournament),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    teamRepo = {
      findByIdOrNull: jest.fn(),
      create: jest.fn(),
      countByTournament: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<TeamRepository>;
    coachRepo = {
      findByAuth0Id: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<CoachRepository>;
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

    service = new HostedTournamentService(
      tournamentRepo,
      {} as TierListRepository,
      teamRepo,
      coachRepo,
      draftRepo,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      discordService,
      s3Service,
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
      teamRepo.findByIdOrNull.mockResolvedValue(otherTournamentTeam as any);

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
      teamRepo.findByIdOrNull.mockResolvedValue(teamDoc as any);

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
      teamRepo.findByIdOrNull.mockResolvedValue({
        _id: teamId,
        tournamentId: tournament.id,
        teamName: "Team Rocket",
        status: "approved",
        logo: "logo-key",
        draftId,
      } as any);
      draftRepo.findById.mockResolvedValue({
        draftKey: "draft-1",
        name: "Draft One",
      } as any);
      discordService.findMember.mockResolvedValue({
        id: "discord-member",
        roleIds: [],
      });

      const result = await service.getSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB);

      expect(result.draft).toEqual({ draftKey: "draft-1", name: "Draft One" });
      expect(result.inDiscordServer).toBe(true);
      expect(discordService.findMember).toHaveBeenCalledWith(
        expect.any(String),
        "ash#1234",
      );
    });
  });

  describe("createSignup", () => {
    it("rejects when droppedBefore is set without a droppedWhy reason", async () => {
      const dto = buildSignUpDto({ droppedBefore: true, droppedWhy: "   " });

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, dto),
      ).rejects.toMatchObject({
        code: ErrorCodes.VALIDATION.MISSING_FIELD.code,
      });
      expect(teamRepo.create).not.toHaveBeenCalled();
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
      teamRepo.findByIdOrNull.mockResolvedValue({
        _id: existingTeamId,
        tournamentId: tournament.id,
      } as any);

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).rejects.toMatchObject({
        code: ErrorCodes.LEAGUE.ALREADY_SIGNED_UP.code,
      });
      expect(teamRepo.create).not.toHaveBeenCalled();
      expect(coachRepo.create).not.toHaveBeenCalled();
    });

    it("creates the team and coach with matching cross-referenced ids on success", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      teamRepo.create.mockResolvedValue({} as any);
      const createdCoachId = new Types.ObjectId();
      coachRepo.create.mockResolvedValue({ _id: createdCoachId } as any);

      const dto = buildSignUpDto();
      const result = await service.createSignup(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        SUB,
        dto,
      );

      expect(teamRepo.create).toHaveBeenCalledTimes(1);
      const teamInput = teamRepo.create.mock.calls[0][0];
      expect(teamInput).toMatchObject({
        tournamentId: tournament.id,
        teamName: dto.teamName,
        logo: dto.logo,
        status: "pending",
      });

      expect(coachRepo.create).toHaveBeenCalledTimes(1);
      const coachInput = coachRepo.create.mock.calls[0][0];
      expect(coachInput).toMatchObject({
        auth0Id: SUB,
        name: dto.name,
        gameName: dto.gameName,
        discordName: dto.discordName,
        timezone: dto.timezone,
        experience: dto.experience,
        droppedBefore: dto.droppedBefore,
        droppedWhy: dto.droppedWhy,
        confirmed: dto.confirm,
      });

      // The team and coach are pre-generated with each other's id so neither
      // required ref is left dangling on first insert.
      expect(teamInput!.coach).toEqual(coachInput!._id);
      expect(coachInput!.teamId).toEqual(teamInput!._id);

      expect(result).toEqual({
        message: "Sign up successful.",
        userId: createdCoachId.toString(),
        tournamentId: tournament.id,
      });

      // Best-effort Discord side effects: announce in the signup channel,
      // and grant the role if the coach's Discord name resolves to a member.
      expect(discordService.sendMessage).toHaveBeenCalledTimes(1);
      expect(discordService.grantRole).not.toHaveBeenCalled();
    });

    it("doesn't fail the signup when the Discord notification throws", async () => {
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      teamRepo.create.mockResolvedValue({} as any);
      coachRepo.create.mockResolvedValue({ _id: new Types.ObjectId() } as any);
      discordService.sendMessage.mockRejectedValue(new Error("rate limited"));

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).resolves.toMatchObject({ message: "Sign up successful." });
    });
  });
});
