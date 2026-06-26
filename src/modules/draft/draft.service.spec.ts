// The real `agenda` package is ESM-only and breaks Jest's CJS transform.
// draft.service.ts -> draft-engine.service.ts -> agenda.service.ts
// transitively imports it (only for types/decorator metadata), so it must
// be mocked before loading the SUT.
jest.mock("agenda", () => ({}));

import {
  DraftCount,
  Tier,
  TierList,
  TierListPokemon,
} from "@modules/tier-list/tier-list.domain";
import { Types } from "mongoose";
import { getRosterByRound } from "../stage/domain/roster";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
} from "../stage/domain/standings";
import { LeagueMatchupRepository } from "../matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "../stage/stage.repository";
import { TeamRepository } from "../team/team.repository";
import { getDraftOrder } from "./domain/pick-order";
import { getDraftDetails, isCoach } from "./domain/team-summary";
import { DraftEngineService } from "./draft-engine.service";
import { DraftPickDto, SetPicksDto } from "./draft.dto";
import { DraftRepository } from "./draft.repository";
import { DraftService } from "./draft.service";

jest.mock("./domain/team-summary", () => ({
  getDraftDetails: jest.fn(),
  isCoach: jest.fn(),
}));
jest.mock("./domain/pick-order", () => ({
  getDraftOrder: jest.fn(),
}));
jest.mock("../stage/domain/roster", () => ({
  getRosterByRound: jest.fn(),
}));
jest.mock("../stage/domain/standings", () => ({
  calculateDivisionCoachStandings: jest.fn(),
  calculateDivisionPokemonStandings: jest.fn(),
}));

const mockedGetDraftDetails = getDraftDetails as jest.Mock;
const mockedIsCoach = isCoach as jest.Mock;
const mockedGetDraftOrder = getDraftOrder as jest.Mock;
const mockedGetRosterByRound = getRosterByRound as jest.Mock;
const mockedCalculateDivisionCoachStandings = calculateDivisionCoachStandings as jest.Mock;
const mockedCalculateDivisionPokemonStandings = calculateDivisionPokemonStandings as jest.Mock;

function buildTierList(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: "tierlist-1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map([["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })]]),
    tiers: [new Tier({ name: "S", cost: 10 })],
    banned: { moves: [], abilities: [] },
    draftCount: new DraftCount({ min: 1, max: 2 }),
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: "tournament-1",
    owner: "auth0|owner",
    organizers: [],
    tierList: buildTierList(),
    ...overrides,
  } as any;
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    coach: { name: "Ash", auth0Id: "auth0|coach-1", timezone: "America/Los_Angeles" },
    pickLog: [],
    picks: [],
    logo: undefined,
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
    ...overrides,
  } as any;
}

function buildDraft(overrides: Record<string, unknown> = {}) {
  return {
    tournamentId: new Types.ObjectId(),
    teams: [],
    orderProgression: "snake",
    counter: 0,
    ...overrides,
  } as any;
}

describe("DraftService", () => {
  let draftRepo: jest.Mocked<DraftRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let stageRepo: jest.Mocked<StageRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let draftEngine: jest.Mocked<DraftEngineService>;
  let service: DraftService;

  beforeEach(() => {
    draftRepo = {
      findTournament: jest.fn(),
      findDraft: jest.fn(),
      findTeamInDraftOrThrow: jest.fn(),
    } as unknown as jest.Mocked<DraftRepository>;
    matchupRepo = { findByStage: jest.fn() } as unknown as jest.Mocked<LeagueMatchupRepository>;
    stageRepo = {
      findById: jest.fn(),
      findAllByTournament: jest.fn(),
      flattenPoolTeamIds: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<StageRepository>;
    teamRepo = { findManyByIds: jest.fn() } as unknown as jest.Mocked<TeamRepository>;
    draftEngine = {
      draftPokemon: jest.fn(),
      setDraftState: jest.fn(),
      skipCurrentPick: jest.fn(),
    } as unknown as jest.Mocked<DraftEngineService>;
    service = new DraftService(draftRepo, matchupRepo, stageRepo, teamRepo, draftEngine);
  });

  describe("getDetails", () => {
    it("loads context and delegates to getDraftDetails", async () => {
      const tournament = buildTournament();
      const draft = buildDraft();
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      const details = { draftName: "Spring Draft" };
      mockedGetDraftDetails.mockResolvedValue(details);

      const result = await service.getDetails("league-1", "tournament-1", "draft-1", "auth0|sub");

      expect(draftRepo.findTournament).toHaveBeenCalledWith("league-1", "tournament-1");
      expect(draftRepo.findDraft).toHaveBeenCalledWith(tournament, "draft-1");
      expect(mockedGetDraftDetails).toHaveBeenCalledWith(tournament, draft, "auth0|sub");
      expect(result).toBe(details);
    });
  });

  describe("getPicks", () => {
    it("resolves each pick's name/tier and the picker's auth0Id when populated", async () => {
      const tournament = buildTournament();
      const team = buildTeam({
        pickLog: [
          {
            pokemon: { id: "pikachu" },
            addons: ["Tera Captain"],
            timestamp: new Date("2026-01-01"),
            picker: { auth0Id: "auth0|coach-1" },
          },
        ],
      });
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);

      const result = await service.getPicks("league-1", "tournament-1", "draft-1");

      expect(team.populate).toHaveBeenCalledWith("pickLog.picker");
      expect(result).toEqual([
        {
          name: "Team Rocket",
          id: team._id.toString(),
          picks: [
            {
              pokemon: {
                id: "pikachu",
                name: "Pikachu",
                tier: new Tier({ name: "S", cost: 10 }),
                capt: { tera: true },
              },
              timestamp: team.pickLog[0].timestamp,
              picker: "auth0|coach-1",
            },
          ],
        },
      ]);
    });

    it("leaves picker undefined when it isn't populated with an auth0Id", async () => {
      const tournament = buildTournament();
      const team = buildTeam({
        pickLog: [
          {
            pokemon: { id: "pikachu" },
            timestamp: new Date("2026-01-01"),
            picker: new Types.ObjectId(),
          },
        ],
      });
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);

      const result = await service.getPicks("league-1", "tournament-1", "draft-1");

      expect(result[0].picks[0].picker).toBeUndefined();
    });
  });

  describe("getOrder", () => {
    it("uses getDraftOrder's (seeded) order rather than draft.teams' raw order", async () => {
      // getDetails/getTeams resolve team order via getDraftOrder(draft), which
      // shuffles when draft.useRandomSeeding is true (the schema default).
      // getOrder must agree, so the publicly displayed draft order always
      // matches the order actually used to determine whose turn it is.
      const teamA = buildTeam({ teamName: "A" });
      const teamB = buildTeam({ teamName: "B" });
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [teamA, teamB],
        useRandomSeeding: true,
        counter: 0,
      });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      // Simulate getDraftOrder shuffling B ahead of A for this draft id.
      mockedGetDraftOrder.mockReturnValue([teamB, teamA]);

      const result = await service.getOrder("league-1", "tournament-1", "draft-1");

      expect(mockedGetDraftOrder).toHaveBeenCalledWith(draft);
      expect(result[0].map((p: any) => p.teamName)).toEqual(["B", "A"]);
    });

    it("reverses even-indexed (1-based odd) rounds for snake progression", async () => {
      const teamA = buildTeam({ teamName: "A" });
      const teamB = buildTeam({ teamName: "B" });
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [teamA, teamB], orderProgression: "snake" });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      mockedGetDraftOrder.mockReturnValue([teamA, teamB]);

      const result = await service.getOrder("league-1", "tournament-1", "draft-1");

      expect(result[0].map((p: any) => p.teamName)).toEqual(["A", "B"]);
      expect(result[1].map((p: any) => p.teamName)).toEqual(["B", "A"]);
    });

    it("includes each team's already-made pick by round", async () => {
      const teamA = buildTeam({
        teamName: "A",
        pickLog: [{ pokemon: { id: "pikachu" } }],
      });
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [teamA] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      mockedGetDraftOrder.mockReturnValue([teamA]);

      const result = await service.getOrder("league-1", "tournament-1", "draft-1");

      expect(result[0][0].pokemon).toEqual({ id: "pikachu", name: "Pikachu" });
      expect(result[1][0].pokemon).toBeUndefined();
    });
  });

  describe("draftPick", () => {
    it("throws FORBIDDEN when the caller is neither an organizer nor the team's coach", async () => {
      const tournament = buildTournament({ owner: "auth0|owner", organizers: [] });
      const team = buildTeam();
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      draftRepo.findTeamInDraftOrThrow.mockResolvedValue(team);
      mockedIsCoach.mockResolvedValue(false);
      const dto = { pokemonId: "pikachu" } as DraftPickDto;

      await expect(
        service.draftPick("league-1", "tournament-1", "draft-1", "team-1", "auth0|stranger", dto),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(draftEngine.draftPokemon).not.toHaveBeenCalled();
    });

    it("allows the team's own coach to draft", async () => {
      const tournament = buildTournament();
      const team = buildTeam();
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      draftRepo.findTeamInDraftOrThrow.mockResolvedValue(team);
      mockedIsCoach.mockResolvedValue(true);
      const dto = { pokemonId: "pikachu" } as DraftPickDto;

      const result = await service.draftPick(
        "league-1", "tournament-1", "draft-1", "team-1", "auth0|coach-1", dto,
      );

      expect(draftEngine.draftPokemon).toHaveBeenCalledWith(tournament, draft, team, dto);
      expect(result).toEqual({ message: "Drafted successfully." });
    });

    it("allows a tournament organizer to draft on behalf of a team they don't coach", async () => {
      const tournament = buildTournament({ owner: "auth0|owner-2" });
      const team = buildTeam();
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      draftRepo.findTeamInDraftOrThrow.mockResolvedValue(team);
      mockedIsCoach.mockResolvedValue(false);
      const dto = { pokemonId: "pikachu" } as DraftPickDto;

      await service.draftPick(
        "league-1", "tournament-1", "draft-1", "team-1", "auth0|owner-2", dto,
      );

      expect(draftEngine.draftPokemon).toHaveBeenCalledWith(tournament, draft, team, dto);
    });
  });

  describe("setPicks", () => {
    it("throws FORBIDDEN for a non-coach, non-organizer caller", async () => {
      const tournament = buildTournament();
      const team = buildTeam();
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      draftRepo.findTeamInDraftOrThrow.mockResolvedValue(team);
      mockedIsCoach.mockResolvedValue(false);

      await expect(
        service.setPicks(
          "league-1", "tournament-1", "draft-1", "team-1", "auth0|stranger",
          { picks: [] } as SetPicksDto,
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(team.save).not.toHaveBeenCalled();
    });

    it("sets and saves the team's queued picks for the coach", async () => {
      const tournament = buildTournament();
      const team = buildTeam();
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      draftRepo.findTeamInDraftOrThrow.mockResolvedValue(team);
      mockedIsCoach.mockResolvedValue(true);
      const dto = { picks: [[{ pokemonId: "pikachu" }]] } as SetPicksDto;

      const result = await service.setPicks(
        "league-1", "tournament-1", "draft-1", "team-1", "auth0|coach-1", dto,
      );

      expect(team.picks).toBe(dto.picks);
      expect(team.save).toHaveBeenCalledWith();
      expect(result).toEqual({ message: "Draft pick set successfully." });
    });
  });

  describe("setState", () => {
    it("throws FORBIDDEN for a non-organizer", async () => {
      const tournament = buildTournament({ owner: "auth0|owner", organizers: [] });
      const draft = buildDraft();
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);

      await expect(
        service.setState("league-1", "tournament-1", "draft-1", "auth0|stranger", {
          state: "play",
        }),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(draftEngine.setDraftState).not.toHaveBeenCalled();
    });

    it("delegates to the draft engine for an organizer", async () => {
      const tournament = buildTournament({ owner: "auth0|owner" });
      const draft = buildDraft();
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);

      const result = await service.setState(
        "league-1", "tournament-1", "draft-1", "auth0|owner", { state: "play" },
      );

      expect(draftEngine.setDraftState).toHaveBeenCalledWith(tournament, draft, "play");
      expect(result).toEqual({ message: "Timer set successfully." });
    });
  });

  describe("skipPick", () => {
    it("throws FORBIDDEN for a non-organizer", async () => {
      const tournament = buildTournament({ owner: "auth0|owner", organizers: [] });
      const draft = buildDraft();
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);

      await expect(
        service.skipPick("league-1", "tournament-1", "draft-1", "auth0|stranger"),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(draftEngine.skipCurrentPick).not.toHaveBeenCalled();
    });

    it("delegates to the draft engine for an organizer", async () => {
      const tournament = buildTournament({ owner: "auth0|owner" });
      const draft = buildDraft();
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);

      const result = await service.skipPick("league-1", "tournament-1", "draft-1", "auth0|owner");

      expect(draftEngine.skipCurrentPick).toHaveBeenCalledWith(tournament, draft);
      expect(result).toEqual({ message: "Skip successful." });
    });
  });

  describe("getTeams", () => {
    it("returns roster-only teams (no record) when the tournament has no stages", async () => {
      const team = buildTeam({
        teamName: "A",
        coach: { name: "Ash", auth0Id: "auth0|coach-1", timezone: "UTC" },
      });
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [team] });
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      stageRepo.findAllByTournament.mockResolvedValue([]);
      mockedGetDraftOrder.mockReturnValue([team]);
      mockedGetRosterByRound.mockReturnValue([{ id: "pikachu", addons: undefined }]);

      const result = await service.getTeams("league-1", "tournament-1", "draft-1", "auth0|coach-1");

      expect(result.teams).toEqual([
        {
          id: team._id.toString(),
          coach: "Ash",
          logo: undefined,
          draft: [{ id: "pikachu", name: "Pikachu", capt: { tera: undefined }, cost: 10 }],
          name: "A",
          isCoach: true,
          timezone: "UTC",
        },
      ]);
    });

    it("throws INVALID_PARAMS when multiple stages exist and no stageId was given", async () => {
      const tournament = buildTournament();
      const draft = buildDraft();
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      stageRepo.findAllByTournament.mockResolvedValue([{} as any, {} as any]);

      await expect(
        service.getTeams("league-1", "tournament-1", "draft-1", "auth0|sub"),
      ).rejects.toMatchObject({ code: "VAL-002" });
    });

    it("merges win/loss record and diffMode when exactly one stage is resolved", async () => {
      const team = buildTeam({ teamName: "A" });
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [team] });
      const stage = { _id: new Types.ObjectId(), rounds: [] } as any;
      draftRepo.findTournament.mockResolvedValue(tournament);
      draftRepo.findDraft.mockResolvedValue(draft);
      stageRepo.findById.mockResolvedValue(stage);
      teamRepo.findManyByIds.mockResolvedValue([team]);
      matchupRepo.findByStage.mockResolvedValue([]);
      mockedCalculateDivisionPokemonStandings.mockResolvedValue([]);
      mockedCalculateDivisionCoachStandings.mockResolvedValue({
        coachStandings: [
          { id: team._id.toString(), wins: 3, losses: 1, pokemonDiff: 2, gameDiff: 1 },
        ],
        diffMode: "pokemon",
      });
      mockedGetDraftOrder.mockReturnValue([team]);
      mockedGetRosterByRound.mockReturnValue([]);

      const result = await service.getTeams("league-1", "tournament-1", "draft-1", "auth0|sub", "stage-1");

      expect(stageRepo.findById).toHaveBeenCalledWith("stage-1");
      expect(stageRepo.findAllByTournament).not.toHaveBeenCalled();
      expect((result.teams[0] as any).record).toEqual({ wins: 3, losses: 1, pokemonDiff: 2, gameDiff: 1 });
      expect((result.teams[0] as any).diffMode).toBe("pokemon");
    });
  });
});
