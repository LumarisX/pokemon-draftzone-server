import { ErrorCodes } from "@core/pdz-error-codes";
import { S3Service } from "@core/storage/s3.service";
import { CoachRepository } from "@modules/coach/coach.repository";
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
    slug: TOURNAMENT_KEY,
    signUpDeadline: new Date("2026-01-01"),
    owner: "auth0|owner",
    leagueId: "league-1",
    leagueSlug: "springleague",
    organizers: [],
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
      findBySlug: jest.fn().mockResolvedValue(tournament),
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
      expect(teamInput!.draftId).toBeUndefined();

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

    it("skips Discord side effects when the tournament has no Discord settings", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ discordSettings: undefined }),
      );
      coachRepo.findByAuth0Id.mockResolvedValue([]);
      teamRepo.create.mockResolvedValue({} as any);
      coachRepo.create.mockResolvedValue({ _id: new Types.ObjectId() } as any);

      await expect(
        service.createSignup(LEAGUE_KEY, TOURNAMENT_KEY, SUB, buildSignUpDto()),
      ).resolves.toMatchObject({ message: "Sign up successful." });

      expect(discordService.findMember).not.toHaveBeenCalled();
      expect(discordService.grantRole).not.toHaveBeenCalled();
      expect(discordService.sendMessage).not.toHaveBeenCalled();
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

function buildSettingsTierList(
  overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {},
) {
  return new TierList({
    id: "tier-1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map(),
    tiers: [new Tier({ name: "S", cost: 10 }), new Tier({ name: "A", cost: 5 })],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

describe("HostedTournamentService settings", () => {
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let service: HostedTournamentService;
  let tournament: HostedTournament;

  beforeEach(() => {
    tournament = buildTournament();

    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(tournament),
      updateSettings: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = {
      findById: jest.fn().mockResolvedValue(buildSettingsTierList()),
    } as unknown as jest.Mocked<TierListRepository>;

    service = new HostedTournamentService(
      tournamentRepo,
      tierListRepo,
      {} as TeamRepository,
      {} as CoachRepository,
      {} as DraftRepository,
      {} as StageRepository,
      {} as LeagueMatchupRepository,
      {} as DiscordService,
      {} as S3Service,
    );
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

    it("rejects a format that doesn't match the linked tier list", async () => {
      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          format: "Doubles",
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.FORMAT_MISMATCH.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects tierRequirements naming a tier that doesn't exist on the tier list", async () => {
      await expect(
        service.updateSettings(LEAGUE_KEY, TOURNAMENT_KEY, "auth0|owner", {
          tierRequirements: [{ tierName: "Nonexistent", required: 1 }],
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
          tierRequirements: [{ tierName: "S", required: 3 }],
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.INVALID_SETTINGS.code,
      });
      expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("persists only the provided keys on a valid update", async () => {
      const result = await service.updateSettings(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        "auth0|owner",
        { pointTotal: 100, tierRequirements: [{ tierName: "S", required: 1 }] },
      );

      expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
        tournament.id,
        {
          pointTotal: 100,
          tierRequirements: [{ tierName: "S", required: 1 }],
        },
      );
      expect(result).toEqual({ success: true });
    });
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
    return {
      _id: id,
      slug: `${teamName.toLowerCase().replace(/\s+/g, "-")}-slug`,
      teamName,
      status: "approved",
      coach: { _id: new Types.ObjectId(), name: `${teamName} coach` },
      pickLog: pokemonIds.map((pokemonId) => ({ pokemon: { id: pokemonId } })),
    };
  }

  function buildRosterTierList() {
    return buildSettingsTierList({
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
        ["eevee", new TierListPokemon({ name: "Eevee", tier: "A" })],
        ["snorlax", new TierListPokemon({ name: "Snorlax", tier: "A" })],
      ]),
    });
  }

  function buildService(overrides: {
    tournament: HostedTournament;
    teams?: unknown[];
    stages?: unknown[];
    team?: unknown;
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
    const draftRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
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
      draftRepo,
      stageRepo,
      matchupRepo,
      {} as DiscordService,
      {} as S3Service,
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

      // Combined: Team A and Team B split their two matches 1-1 overall.
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
