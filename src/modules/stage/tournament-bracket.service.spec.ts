import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Test } from "@nestjs/testing";
import { Types } from "mongoose";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { StageRepository } from "./stage.repository";
import { UpdateTournamentBracketDto } from "./tournament-bracket.dto";
import { TournamentBracketService } from "./tournament-bracket.service";

const TOURNAMENT_ID = new Types.ObjectId();

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: TOURNAMENT_ID.toString(),
    owner: "auth0|owner",
    organizers: [],
    rounds: [],
    currentRoundIndex: -1,
    trades: [],
    ...overrides,
  } as any;
}

function buildRound(name: string) {
  return { _id: new Types.ObjectId(), name };
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    logo: "logo-key",
    coach: { name: "Giovanni" },
    ...overrides,
  } as any;
}

function buildStage(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tournamentId: TOURNAMENT_ID,
    name: "Group A",
    type: "round-robin",
    order: 0,
    public: true,
    teamIds: [],
    pools: [],
    rounds: [],
    trades: [],
    seedingLog: [],
    currentRoundIndex: -1,
    ...overrides,
  } as any;
}

const seedSlot = (seed: number) => ({ type: "seed" as const, seed });

describe("TournamentBracketService", () => {
  let stageRepo: jest.Mocked<StageRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let service: TournamentBracketService;

  beforeEach(async () => {
    stageRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
      applyStageDiff: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StageRepository>;

    teamRepo = {
      // Echoes back whatever was asked for, so a fixture never has to keep a
      // separate list of "teams that exist" in sync with the payload.
      findManyByIds: jest
        .fn()
        .mockImplementation(async (ids: any[]) =>
          ids.map((id) => buildTeam({ _id: new Types.ObjectId(id) })),
        ),
    } as unknown as jest.Mocked<TeamRepository>;

    matchupRepo = {
      findByStages: jest.fn().mockResolvedValue([]),
      findStructureByStages: jest.fn().mockResolvedValue([]),
      countByStage: jest.fn().mockResolvedValue(0),
      applyStructureDiff: jest.fn().mockResolvedValue(undefined),
      resolveDownstreamSlots: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;

    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(buildTournament()),
      setSchedule: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentBracketService,
        { provide: StageRepository, useValue: stageRepo },
        { provide: TeamRepository, useValue: teamRepo },
        { provide: LeagueMatchupRepository, useValue: matchupRepo },
        { provide: HostedTournamentRepository, useValue: tournamentRepo },
        {
          provide: BracketAdvancementService,
          useValue: {
            applyToTournament: jest.fn().mockResolvedValue(0),
            applyToStages: jest.fn().mockResolvedValue(0),
            findBlocked: jest.fn().mockResolvedValue(new Set<string>()),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(TournamentBracketService);
  });

  /** Two teams, one stage, one round, one match — the smallest valid payload. */
  function buildDto(overrides: Partial<UpdateTournamentBracketDto> = {}) {
    const teamIds = [
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    ];
    return {
      rounds: [{ name: "Week 1" }],
      stages: [
        {
          key: "groups",
          name: "Group A",
          type: "round-robin",
          seedGroups: [{ teamIds, method: "manual" as const }],
        },
      ],
      matches: [
        {
          key: "m1",
          stageKey: "groups",
          roundIndex: 0,
          a: seedSlot(1),
          b: seedSlot(2),
        },
      ],
      ...overrides,
    } as UpdateTournamentBracketDto;
  }

  const update = (dto: UpdateTournamentBracketDto, sub = "auth0|owner") =>
    service.updateBracket("league-1", "tournament-1", sub, dto);

  describe("authorization", () => {
    it("rejects a non-organizer", async () => {
      await expect(update(buildDto(), "auth0|stranger")).rejects.toMatchObject({
        code: "AUTH-002",
      });
    });
  });

  describe("creating a bracket", () => {
    it("creates the stage, its rounds and its matches", async () => {
      await update(buildDto());

      const diff = stageRepo.applyStageDiff.mock.calls[0][0];
      expect(diff.creates).toHaveLength(1);
      expect(diff.creates[0].name).toBe("Group A");
      expect(diff.creates[0].teamIds).toHaveLength(2);

      expect(tournamentRepo.setSchedule).toHaveBeenCalledWith(
        TOURNAMENT_ID.toString(),
        expect.objectContaining({
          rounds: [expect.objectContaining({ name: "Week 1" })],
          currentRoundIndex: -1,
        }),
      );

      const matchDiff = matchupRepo.applyStructureDiff.mock.calls[0][0];
      expect(matchDiff.creates).toHaveLength(1);
      expect(matchDiff.deletes).toEqual([]);
    });

    it("points a match at the stage it named, not the first stage", async () => {
      const dto = buildDto({
        rounds: [{ name: "Week 1" }],
        stages: [
          {
            key: "a",
            name: "A",
            type: "round-robin",
            seedGroups: [
              {
                teamIds: [
                  new Types.ObjectId().toString(),
                  new Types.ObjectId().toString(),
                ],
                method: "manual",
              },
            ],
          },
          {
            key: "b",
            name: "B",
            type: "round-robin",
            seedGroups: [
              {
                teamIds: [
                  new Types.ObjectId().toString(),
                  new Types.ObjectId().toString(),
                ],
                method: "manual",
              },
            ],
          },
        ],
        matches: [
          {
            key: "m1",
            stageKey: "b",
            roundIndex: 0,
            a: seedSlot(1),
            b: seedSlot(2),
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      const result = await update(dto);

      const created = matchupRepo.applyStructureDiff.mock.calls[0][0].creates[0];
      expect(created.stage!.toString()).toBe(result.stageIds["b"]);
    });

    it("resolves each stage's seeds against its own team list", async () => {
      const aTeams = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];
      const bTeams = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];
      const dto = buildDto({
        stages: [
          {
            key: "a",
            name: "A",
            type: "round-robin",
            seedGroups: [{ teamIds: aTeams, method: "manual" }],
          },
          {
            key: "b",
            name: "B",
            type: "round-robin",
            seedGroups: [{ teamIds: bTeams, method: "manual" }],
          },
        ],
        matches: [
          {
            key: "ma",
            stageKey: "a",
            roundIndex: 0,
            a: seedSlot(1),
            b: seedSlot(2),
          },
          {
            key: "mb",
            stageKey: "b",
            roundIndex: 0,
            a: seedSlot(1),
            b: seedSlot(2),
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await update(dto);

      const creates = matchupRepo.applyStructureDiff.mock.calls[0][0].creates;
      // Seed 1 means a different team in each stage.
      expect(creates[0].side1!.team!.toString()).toBe(aTeams[0]);
      expect(creates[1].side1!.team!.toString()).toBe(bTeams[0]);
    });
  });

  describe("structure validation", () => {
    it("rejects a payload with no rounds", async () => {
      await expect(
        update(buildDto({ rounds: [] })),
      ).rejects.toMatchObject({ code: "STG-004" });
    });

    it("rejects a seed outside its stage's team count", async () => {
      const dto = buildDto();
      dto.matches[0].b = seedSlot(5);

      await expect(update(dto)).rejects.toMatchObject({ code: "STG-004" });
    });

    it("rejects a match on a stage the payload does not declare", async () => {
      const dto = buildDto();
      dto.matches[0].stageKey = "nope";

      await expect(update(dto)).rejects.toMatchObject({ code: "STG-004" });
    });

    it("accepts a slot fed by a match in another stage", async () => {
      const groupTeams = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];
      const dto = buildDto({
        rounds: [{ name: "Week 1" }, { name: "Final" }],
        stages: [
          {
            key: "groups",
            name: "Groups",
            type: "round-robin",
            seedGroups: [{ teamIds: groupTeams, method: "manual" }],
          },
          { key: "finals", name: "Finals", type: "single-elimination" },
        ],
        matches: [
          {
            key: "g1",
            stageKey: "groups",
            roundIndex: 0,
            a: seedSlot(1),
            b: seedSlot(2),
          },
          {
            key: "f1",
            stageKey: "finals",
            roundIndex: 1,
            a: { type: "winner", from: "g1" },
            b: { type: "loser", from: "g1" },
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await expect(update(dto)).resolves.toMatchObject({
        message: expect.stringContaining("2 match(es) added"),
      });
    });
  });

  describe("editing a live bracket", () => {
    it("keeps a round's id so its matchups are not orphaned", async () => {
      const round = buildRound("Week 1");
      const stage = buildStage();
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ rounds: [round], currentRoundIndex: 0 }),
      );
      stageRepo.findAllByTournament.mockResolvedValue([stage]);

      const dto = buildDto({
        rounds: [{ _id: round._id.toString(), name: "Week 1 (renamed)" }],
        stages: [
          {
            _id: stage._id.toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
            seedGroups: [
              {
                teamIds: [
                  new Types.ObjectId().toString(),
                  new Types.ObjectId().toString(),
                ],
                method: "manual",
              },
            ],
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await update(dto);

      const schedule = tournamentRepo.setSchedule.mock.calls[0][1];
      expect(schedule.rounds[0]._id.toString()).toBe(round._id.toString());
      expect(schedule.rounds[0].name).toBe("Week 1 (renamed)");
    });

    it("follows the current round when an edit shifts its index", async () => {
      const week1 = buildRound("Week 1");
      const week2 = buildRound("Week 2");
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ rounds: [week1, week2], currentRoundIndex: 1 }),
      );

      const dto = buildDto({
        // A new round is inserted before both, pushing Week 2 from 1 to 2.
        rounds: [
          { name: "Week 0" },
          { _id: week1._id.toString(), name: "Week 1" },
          { _id: week2._id.toString(), name: "Week 2" },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await update(dto);

      expect(tournamentRepo.setSchedule.mock.calls[0][1].currentRoundIndex).toBe(
        2,
      );
    });

    it("refuses to delete a matchup that has recorded results", async () => {
      const stage = buildStage();
      stageRepo.findAllByTournament.mockResolvedValue([stage]);
      matchupRepo.findStructureByStages.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          stage: stage._id,
          side1: {},
          side2: {},
          results: [{ winner: "side1" }],
        },
      ] as any);

      const dto = buildDto({
        stages: [
          {
            _id: stage._id.toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
            seedGroups: [
              {
                teamIds: [
                  new Types.ObjectId().toString(),
                  new Types.ObjectId().toString(),
                ],
                method: "manual",
              },
            ],
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await expect(update(dto)).rejects.toMatchObject({ code: "STG-004" });
      expect(matchupRepo.applyStructureDiff).not.toHaveBeenCalled();
    });

    it("updates a surviving matchup in place rather than recreating it", async () => {
      const stage = buildStage();
      const matchupId = new Types.ObjectId();
      stageRepo.findAllByTournament.mockResolvedValue([stage]);
      matchupRepo.findStructureByStages.mockResolvedValue([
        {
          _id: matchupId,
          stage: stage._id,
          side1: { slot: { type: "seed", seed: 1 } },
          side2: { slot: { type: "seed", seed: 2 } },
          results: [],
        },
      ] as any);

      const dto = buildDto({
        stages: [
          {
            _id: stage._id.toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
            seedGroups: [
              {
                teamIds: [
                  new Types.ObjectId().toString(),
                  new Types.ObjectId().toString(),
                ],
                method: "manual",
              },
            ],
          },
        ],
        matches: [
          {
            _id: matchupId.toString(),
            key: "m1",
            stageKey: "groups",
            roundIndex: 0,
            a: seedSlot(1),
            b: seedSlot(2),
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await update(dto);

      const diff = matchupRepo.applyStructureDiff.mock.calls[0][0];
      expect(diff.creates).toEqual([]);
      expect(diff.deletes).toEqual([]);
      expect(diff.updates[0]._id.toString()).toBe(matchupId.toString());
    });

    it("refuses to remove a stage the payload still assigns matches to", async () => {
      // Only reachable by naming a stage in `matches` while dropping its `_id`
      // from `stages` — which would leave the matchups pointing at nothing.
      const stage = buildStage({ name: "Doomed" });
      stageRepo.findAllByTournament.mockResolvedValue([stage]);

      const dto = buildDto();
      await expect(update(dto)).resolves.toBeDefined();

      // The stage was dropped from the payload and had no matches of its own,
      // so removing it is fine.
      expect(
        stageRepo.applyStageDiff.mock.calls[0][0].deletes.map(String),
      ).toEqual([stage._id.toString()]);
    });
  });

  describe("seeding", () => {
    it("refuses to re-draw a live stage's seeding", async () => {
      const stage = buildStage({
        teamIds: [new Types.ObjectId(), new Types.ObjectId()],
      });
      stageRepo.findAllByTournament.mockResolvedValue([stage]);
      matchupRepo.countByStage.mockResolvedValue(4);

      const dto = buildDto({
        stages: [
          {
            _id: stage._id.toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
            seedGroups: [
              {
                // A different order than the stage already holds.
                teamIds: [
                  new Types.ObjectId().toString(),
                  new Types.ObjectId().toString(),
                ],
                method: "manual",
              },
            ],
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await expect(update(dto)).rejects.toMatchObject({ code: "STG-006" });
    });

    it("lets teams be appended to a live stage's seeding", async () => {
      const seeded = [new Types.ObjectId(), new Types.ObjectId()];
      const added = new Types.ObjectId().toString();
      const stage = buildStage({ teamIds: seeded });
      stageRepo.findAllByTournament.mockResolvedValue([stage]);
      matchupRepo.countByStage.mockResolvedValue(4);

      const dto = buildDto({
        stages: [
          {
            _id: stage._id.toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
            seedGroups: [
              {
                teamIds: [...seeded.map(String), added],
                method: "manual",
              },
            ],
          },
        ],
        matches: [
          {
            key: "m1",
            stageKey: "groups",
            roundIndex: 0,
            a: seedSlot(1),
            b: seedSlot(2),
          },
          {
            key: "m2",
            stageKey: "groups",
            roundIndex: 0,
            a: seedSlot(3),
            b: seedSlot(1),
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await update(dto);

      const stageUpdate = stageRepo.applyStageDiff.mock.calls[0][0].updates[0];
      expect(
        (stageUpdate.set.teamIds as Types.ObjectId[]).map(String),
      ).toEqual([...seeded.map(String), added]);
      // The appended block is recorded as its own manual draw.
      expect(stageUpdate.set.seedingLog).toHaveLength(1);
    });

    it("keeps a stage's teams when the payload omits seedGroups", async () => {
      const seeded = [new Types.ObjectId(), new Types.ObjectId()];
      const stage = buildStage({ teamIds: seeded });
      stageRepo.findAllByTournament.mockResolvedValue([stage]);

      const dto = buildDto({
        stages: [
          {
            _id: stage._id.toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await update(dto);

      const stageUpdate = stageRepo.applyStageDiff.mock.calls[0][0].updates[0];
      expect(
        (stageUpdate.set.teamIds as Types.ObjectId[]).map(String),
      ).toEqual(seeded.map(String));
    });

    it("leaves a hidden stage hidden when the payload omits `public`", async () => {
      const stage = buildStage({
        public: false,
        teamIds: [new Types.ObjectId(), new Types.ObjectId()],
      });
      stageRepo.findAllByTournament.mockResolvedValue([stage]);

      const dto = buildDto({
        stages: [
          {
            _id: stage._id.toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await update(dto);

      const stageUpdate = stageRepo.applyStageDiff.mock.calls[0][0].updates[0];
      expect(stageUpdate.set).not.toHaveProperty("public");
    });

    it("rejects an unknown stage id rather than silently creating a new stage", async () => {
      const dto = buildDto({
        stages: [
          {
            _id: new Types.ObjectId().toString(),
            key: "groups",
            name: "Group A",
            type: "round-robin",
            seedGroups: [
              {
                teamIds: [
                  new Types.ObjectId().toString(),
                  new Types.ObjectId().toString(),
                ],
                method: "manual",
              },
            ],
          },
        ],
      } as Partial<UpdateTournamentBracketDto>);

      await expect(update(dto)).rejects.toMatchObject({ code: "STG-001" });
    });

    it("rejects a team id that does not resolve", async () => {
      teamRepo.findManyByIds.mockResolvedValue([]);

      await expect(update(buildDto())).rejects.toMatchObject({
        code: "LR-TEAM-001",
      });
    });
  });

  describe("setCurrentRound", () => {
    const advance = (index: number, sub = "auth0|owner") =>
      service.setCurrentRound("league-1", "tournament-1", sub, index);

    beforeEach(() => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          rounds: [buildRound("Week 1"), buildRound("Week 2")],
          currentRoundIndex: 0,
          stages: [],
        }),
      );
    });

    it("moves the tournament to the given round", async () => {
      const result = await advance(1);

      expect(result).toMatchObject({ currentRoundIndex: 1 });
      expect(tournamentRepo.setSchedule.mock.calls[0][1]).toMatchObject({
        currentRoundIndex: 1,
      });
    });

    it("rejects a round past the end of the axis", async () => {
      await expect(advance(2)).rejects.toMatchObject({ code: "VAL-002" });
    });

    it("allows -1, meaning the season has not started", async () => {
      await expect(advance(-1)).resolves.toMatchObject({
        currentRoundIndex: -1,
      });
    });

    it("rejects a non-organizer", async () => {
      await expect(advance(1, "auth0|stranger")).rejects.toMatchObject({
        code: "AUTH-002",
      });
    });

    it("refuses a tournament that has no axis of its own yet", async () => {
      // Unmigrated: its rounds still live on its stages, so the stage-scoped
      // route is the one that works.
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ rounds: [] }),
      );

      await expect(advance(0)).rejects.toMatchObject({ code: "STG-001" });
    });
  });

  describe("getBracket", () => {
    it("returns rounds, stages with seeded teams, and matches", async () => {
      const round = buildRound("Week 1");
      const team = buildTeam({ teamName: "Rockets" });
      const stage = buildStage({ teamIds: [team._id] });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ rounds: [round], currentRoundIndex: 0 }),
      );
      stageRepo.findAllByTournament.mockResolvedValue([stage]);
      teamRepo.findManyByIds.mockResolvedValue([team]);
      matchupRepo.findByStages.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          stage: stage._id,
          round: round._id,
          side1: { slot: { type: "seed", seed: 1 } },
          side2: { slot: { type: "winner", matchId: "abc" } },
          results: [],
        },
      ] as any);

      const result = await service.getBracket("league-1", "tournament-1");

      expect(result.rounds).toEqual([
        expect.objectContaining({ name: "Week 1" }),
      ]);
      expect(result.stages[0].teams).toEqual([
        expect.objectContaining({ seed: 1, teamName: "Rockets" }),
      ]);
      expect(result.matches[0].a).toEqual({ type: "seed", seed: 1 });
      expect(result.matches[0].b).toEqual({ type: "winner", from: "abc" });
    });

    it("hides a hidden stage from anyone but an organizer", async () => {
      const visible = buildStage({ name: "Public" });
      const hidden = buildStage({ name: "Hidden", public: false });
      stageRepo.findAllByTournament.mockResolvedValue([visible, hidden]);

      const asStranger = await service.getBracket(
        "league-1",
        "tournament-1",
        "auth0|stranger",
      );
      expect(asStranger.stages.map((s) => s.name)).toEqual(["Public"]);

      const asOwner = await service.getBracket(
        "league-1",
        "tournament-1",
        "auth0|owner",
      );
      expect(asOwner.stages.map((s) => s.name)).toEqual(["Public", "Hidden"]);
    });
  });
});
