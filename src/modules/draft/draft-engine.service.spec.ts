// The real `agenda` package is ESM-only and breaks Jest's CJS transform.
// draft-engine.service.ts -> agenda.service.ts transitively imports it
// (only for types/decorator metadata), so it must be mocked before loading
// the SUT.
jest.mock("agenda", () => ({}));

import { AgendaService } from "@modules/agenda/agenda.service";
import { DiscordService } from "@modules/discord/discord.service";
import { ConfigService } from "@nestjs/config";
import {
  DraftCount,
  Tier,
  TierList,
  TierListPokemon,
} from "@modules/tier-list/tier-list.domain";
import mongoose, { ClientSession, Connection, Types } from "mongoose";
import { DraftEngineService } from "./draft-engine.service";
import { DraftEventsService } from "./draft-events.service";
import { TeamRepository } from "../team/team.repository";

function buildFakeSession(): jest.Mocked<ClientSession> {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn(),
  } as unknown as jest.Mocked<ClientSession>;
}

function buildTierList(
  overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {},
) {
  return new TierList({
    id: "tierlist-1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map([
      ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
      ["charizard", new TierListPokemon({ name: "Charizard", tier: "A" })],
    ]),
    tiers: [
      new Tier({ name: "S", cost: 10 }),
      new Tier({ name: "A", cost: 5 }),
    ],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

function buildTournament(overrides: Record<string, unknown> = {}) {
  const tierList =
    (overrides.tierList as TierList | undefined) ?? buildTierList();
  return {
    slug: "spring-cup",
    leagueSlug: "spring-league",
    tierList,
    draftCount: new DraftCount({ min: 1, max: 1 }),
    pointTotal: undefined,
    tierRequirements: [],
    ...overrides,
  } as any;
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  const team: any = {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    coach: { _id: new Types.ObjectId(), discordName: "ash#1234" },
    pickLog: [],
    picks: [],
    skipCount: 0,
    save: jest.fn().mockResolvedValue(undefined),
    toObject: jest.fn(),
    ...overrides,
  };
  team.toObject.mockImplementation(() => ({ ...team }));
  team.populate = jest.fn().mockResolvedValue(team);
  return team;
}

function buildDraft(overrides: Record<string, unknown> = {}) {
  const draft: any = {
    _id: new Types.ObjectId(),
    slug: "spring-draft",
    name: "Spring Draft",
    status: "IN_PROGRESS",
    sequentialTurns: true,
    orderProgression: "snake",
    useRandomSeeding: false,
    counter: 0,
    teams: [],
    eventLog: [],
    timerLength: 120,
    save: jest.fn().mockResolvedValue(undefined),
    toObject: jest.fn(),
    ...overrides,
  };
  draft.toObject.mockImplementation(() => ({ ...draft }));
  return draft;
}

describe("DraftEngineService", () => {
  let teamRepo: jest.Mocked<TeamRepository>;
  let discordService: jest.Mocked<DiscordService>;
  let draftEvents: jest.Mocked<DraftEventsService>;
  let agendaService: jest.Mocked<AgendaService>;
  let configService: jest.Mocked<ConfigService>;
  let engine: DraftEngineService;
  let fakeSession: jest.Mocked<ClientSession>;
  let fakeConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    teamRepo = {
      findByIdOrNull: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;
    discordService = {
      resolveMention: jest.fn().mockResolvedValue(null),
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DiscordService>;
    draftEvents = {
      emitDraftAdded: jest.fn(),
      emitDraftCounter: jest.fn(),
      emitDraftCompleted: jest.fn(),
      emitDraftSkip: jest.fn(),
      emitDraftStatus: jest.fn(),
    } as unknown as jest.Mocked<DraftEventsService>;
    agendaService = {
      cancelSkipPick: jest.fn().mockResolvedValue(undefined),
      resumeSkipPick: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AgendaService>;
    fakeConnection = {
      startSession: jest.fn(),
    } as unknown as jest.Mocked<Connection>;
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;
    engine = new DraftEngineService(
      fakeConnection,
      teamRepo,
      discordService,
      draftEvents,
      agendaService,
      configService,
    );

    fakeSession = buildFakeSession();
    fakeConnection.startSession.mockResolvedValue(fakeSession);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("draftPokemon validation", () => {
    it("throws when the team isn't part of the draft", async () => {
      const tournament = buildTournament();
      const team = buildTeam();
      const draft = buildDraft({ teams: [] });

      await expect(
        engine.draftPokemon(tournament, draft, team, { pokemonId: "pikachu" }),
      ).rejects.toThrow("Team not found in draft.");
      expect(fakeSession.abortTransaction).toHaveBeenCalled();
    });

    it("throws when it isn't this team's turn", async () => {
      const teamA = buildTeam({ teamName: "A" });
      const teamB = buildTeam({ teamName: "B" });
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [teamA, teamB], counter: 0 }); // A's turn

      await expect(
        engine.draftPokemon(tournament, draft, teamB, { pokemonId: "pikachu" }),
      ).rejects.toThrow("It is not this team's turn to draft.");
    });

    it("throws with the specific reason when the pick is invalid", async () => {
      const team = buildTeam();
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [team] });

      await expect(
        engine.draftPokemon(tournament, draft, team, { pokemonId: "" }),
      ).rejects.toThrow("Invalid Pokemon ID");
    });

    it("rolls back the transaction it created on failure", async () => {
      const team = buildTeam();
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [] });

      await expect(
        engine.draftPokemon(tournament, draft, team, { pokemonId: "pikachu" }),
      ).rejects.toThrow();

      expect(fakeSession.abortTransaction).toHaveBeenCalledTimes(1);
      expect(fakeSession.commitTransaction).not.toHaveBeenCalled();
      expect(fakeSession.endSession).toHaveBeenCalledTimes(1);
    });

    it("doesn't manage the transaction itself when a session is passed in", async () => {
      const team = buildTeam();
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [] });
      const externalSession = buildFakeSession();

      await expect(
        engine.draftPokemon(
          tournament,
          draft,
          team,
          { pokemonId: "pikachu" },
          externalSession,
        ),
      ).rejects.toThrow();

      expect(externalSession.abortTransaction).not.toHaveBeenCalled();
      expect(externalSession.endSession).not.toHaveBeenCalled();
      expect(fakeConnection.startSession).not.toHaveBeenCalled();
    });
  });

  describe("draftPokemon success", () => {
    it("appends the pick to pickLog and persists the team", async () => {
      const tierList = buildTierList();
      const team = buildTeam();
      const tournament = buildTournament({
        tierList,
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team] });

      await engine.draftPokemon(tournament, draft, team, {
        pokemonId: "pikachu",
      });

      expect(team.pickLog).toHaveLength(1);
      expect(team.pickLog[0].pokemon.id).toBe("pikachu");
      expect(team.save).toHaveBeenCalled();
      expect(fakeSession.commitTransaction).toHaveBeenCalled();
    });

    it("removes the drafted Pokemon from every other team's queued picks (snipe protection)", async () => {
      // teamC (not up next) holds the queued picks under test, so the
      // engine's own auto-draft-on-turn behavior (which would otherwise
      // consume teamB's queue the moment it becomes their turn) doesn't
      // interfere with observing the snipe-removal in isolation.
      const tierList = buildTierList();
      const teamA = buildTeam({ teamName: "A" });
      const teamB = buildTeam({ teamName: "B" });
      const teamC = buildTeam({
        teamName: "C",
        picks: [[{ pokemonId: "pikachu" }, { pokemonId: "charizard" }]],
      });
      const tournament = buildTournament({
        tierList,
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [teamA, teamB, teamC] });

      await engine.draftPokemon(tournament, draft, teamA, {
        pokemonId: "pikachu",
      });

      expect(teamC.picks[0]).toEqual([{ pokemonId: "charizard" }]);
      expect(teamC.save).toHaveBeenCalled();
    });

    it("emits a draft.added event with the pick/team summary", async () => {
      const tierList = buildTierList();
      const team = buildTeam();
      const tournament = buildTournament({
        tierList,
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team] });

      await engine.draftPokemon(tournament, draft, team, {
        pokemonId: "pikachu",
      });

      expect(draftEvents.emitDraftAdded).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentSlug: "spring-cup",
          draftSlug: "spring-draft",
          pick: expect.objectContaining({
            pokemon: expect.objectContaining({
              id: "pikachu",
              name: "Pikachu",
              tier: "S",
              cost: 10,
            }),
          }),
        }),
      );
    });

    it("doesn't send a Discord message when the draft has no channelId", async () => {
      const tierList = buildTierList();
      const team = buildTeam();
      const tournament = buildTournament({
        tierList,
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team], channelId: undefined });

      await engine.draftPokemon(tournament, draft, team, {
        pokemonId: "pikachu",
      });

      expect(discordService.sendMessage).not.toHaveBeenCalled();
    });

    it("sends a Discord announcement when the draft has a channelId", async () => {
      const tierList = buildTierList();
      const team = buildTeam();
      const tournament = buildTournament({
        tierList,
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team], channelId: "channel-1" });

      await engine.draftPokemon(tournament, draft, team, {
        pokemonId: "pikachu",
      });

      expect(discordService.resolveMention).toHaveBeenCalledWith(
        "channel-1",
        "ash#1234",
      );
      expect(discordService.sendMessage).toHaveBeenCalledWith(
        "channel-1",
        expect.objectContaining({
          content: expect.stringContaining("Pikachu was drafted"),
        }),
      );
    });

    it("links the pick embed to this draft's own league, tournament, and draft", async () => {
      const team = buildTeam();
      const tournament = buildTournament({
        leagueSlug: "spring-league",
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team], channelId: "channel-1" });

      await engine.draftPokemon(tournament, draft, team, {
        pokemonId: "pikachu",
      });

      const [, payload] = discordService.sendMessage.mock.calls[0];
      expect(payload.embeds?.[0].data.url).toBe(
        "https://pokemondraftzone.com/leagues/spring-league/tournaments/spring-cup/drafts/spring-draft/draft",
      );
    });

    it("points embed links at CLIENT_URL when one is configured", async () => {
      configService.get.mockReturnValue("http://localhost:4200/");
      const team = buildTeam();
      const tournament = buildTournament({
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team], channelId: "channel-1" });

      await engine.draftPokemon(tournament, draft, team, {
        pokemonId: "pikachu",
      });

      const [, payload] = discordService.sendMessage.mock.calls[0];
      expect(payload.embeds?.[0].data.url).toBe(
        "http://localhost:4200/leagues/spring-league/tournaments/spring-cup/drafts/spring-draft/draft",
      );
    });

    it("completes the draft once the last required pick is made", async () => {
      const tierList = buildTierList();
      const team = buildTeam();
      const tournament = buildTournament({ tierList });
      const draft = buildDraft({ teams: [team], counter: 0 });

      await engine.draftPokemon(tournament, draft, team, {
        pokemonId: "pikachu",
      });

      expect(draft.status).toBe("COMPLETED");
      expect(draftEvents.emitDraftCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentSlug: "spring-cup",
          draftSlug: "spring-draft",
        }),
      );
      expect(agendaService.cancelSkipPick).toHaveBeenCalled();
    });
  });

  describe("undraftPokemon", () => {
    it("refuses a coach removal when the draft doesn't allow removals", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const draft = buildDraft({
        teams: [team],
        sequentialTurns: true,
        allowRemovals: false,
      });

      await expect(
        engine.undraftPokemon(draft, team, "pikachu"),
      ).rejects.toThrow("Draft does not allow removals.");
    });

    it("lets an organizer remove a pick even when removals are off", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const draft = buildDraft({
        teams: [team],
        sequentialTurns: true,
        allowRemovals: false,
      });

      await engine.undraftPokemon(draft, team, "pikachu", true);

      expect(team.pickLog).toHaveLength(0);
      expect(team.save).toHaveBeenCalled();
    });
  });

  describe("setPickAtRound", () => {
    const threeMonTierList = () =>
      buildTierList({
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
          ["charizard", new TierListPokemon({ name: "Charizard", tier: "A" })],
          ["blastoise", new TierListPokemon({ name: "Blastoise", tier: "A" })],
        ]),
      });

    it("appends when the round is the team's next open slot", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      const draft = buildDraft({ teams: [team] });

      await engine.setPickAtRound(tournament, draft, team, 1, {
        pokemonId: "charizard",
      });

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual([
        "pikachu",
        "charizard",
      ]);
      expect(team.save).toHaveBeenCalled();
    });

    it("replaces an earlier round in place without shifting later rounds", async () => {
      const team = buildTeam({
        pickLog: [
          { pokemon: { id: "pikachu" } },
          { pokemon: { id: "charizard" } },
        ],
      });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      const draft = buildDraft({ teams: [team] });

      await engine.setPickAtRound(tournament, draft, team, 0, {
        pokemonId: "blastoise",
      });

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual([
        "blastoise",
        "charizard",
      ]);
    });

    it("keeps the original picker and timestamp when replacing a round", async () => {
      const picker = new Types.ObjectId();
      const timestamp = new Date("2026-01-01T00:00:00Z");
      const team = buildTeam({
        pickLog: [{ pokemon: { id: "pikachu" }, picker, timestamp }],
      });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      const draft = buildDraft({ teams: [team] });

      await engine.setPickAtRound(tournament, draft, team, 0, {
        pokemonId: "charizard",
      });

      expect(team.pickLog[0].picker).toBe(picker);
      expect(team.pickLog[0].timestamp).toBe(timestamp);
    });

    it("validates a replacement without counting the pick it replaces", async () => {
      // Budget is 10; the team already spends all of it on Pikachu (S/10).
      // Swapping that slot for Charizard (A/5) has to be allowed.
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
        pointTotal: 10,
      });
      const draft = buildDraft({ teams: [team] });

      await engine.setPickAtRound(tournament, draft, team, 0, {
        pokemonId: "charizard",
      });

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual(["charizard"]);
    });

    it("restores the replaced pick when the new one is rejected", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "charizard" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
        pointTotal: 5,
      });
      const draft = buildDraft({ teams: [team] });

      await expect(
        engine.setPickAtRound(tournament, draft, team, 0, {
          pokemonId: "pikachu",
        }),
      ).rejects.toThrow("Team does not have enough points");

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual(["charizard"]);
      expect(team.save).not.toHaveBeenCalled();
    });

    it("refuses a round that would leave a gap in the roster", async () => {
      const team = buildTeam({ pickLog: [] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      const draft = buildDraft({ teams: [team] });

      await expect(
        engine.setPickAtRound(tournament, draft, team, 2, {
          pokemonId: "pikachu",
        }),
      ).rejects.toThrow("Cannot set round 3 before round 1 is filled.");
    });

    it("refuses a round past the end of the draft", async () => {
      const team = buildTeam({ pickLog: [] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team] });

      await expect(
        engine.setPickAtRound(tournament, draft, team, 2, {
          pokemonId: "pikachu",
        }),
      ).rejects.toThrow("Draft only has 2 rounds.");
    });

    it("refuses a Pokemon another team already drafted", async () => {
      const rival = buildTeam({
        teamName: "Rival",
        pickLog: [{ pokemon: { id: "blastoise" } }],
      });
      const team = buildTeam({ pickLog: [] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      const draft = buildDraft({ teams: [team, rival] });

      await expect(
        engine.setPickAtRound(tournament, draft, team, 0, {
          pokemonId: "blastoise",
        }),
      ).rejects.toThrow("already been drafted");
    });
  });

  describe("skipCurrentPick", () => {
    it("returns false when the draft isn't in progress", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({ status: "PAUSED" });

      await expect(engine.skipCurrentPick(tournament, draft)).resolves.toBe(
        false,
      );
    });

    it("returns false when there is no current picking team", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [] });

      await expect(engine.skipCurrentPick(tournament, draft)).resolves.toBe(
        false,
      );
    });

    it("increments the picking team's skipCount and logs a SKIP event", async () => {
      const team = buildTeam({ skipCount: 0 });
      teamRepo.findByIdOrNull.mockResolvedValue(team);
      const tournament = buildTournament({
        tierList: buildTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team], counter: 0 });

      const result = await engine.skipCurrentPick(tournament, draft);

      expect(result).toBe(true);
      expect(team.skipCount).toBe(1);
      expect(team.save).toHaveBeenCalled();
      expect(draft.eventLog).toEqual([
        expect.objectContaining({
          eventType: "SKIP",
          details: "Team Rocket was skipped",
        }),
      ]);
      expect(draftEvents.emitDraftSkip).toHaveBeenCalledWith(
        expect.objectContaining({ teamName: "Team Rocket", skipCount: 1 }),
      );
    });

    it("sends a Discord message naming the skipped team when channelId is set", async () => {
      const team = buildTeam();
      teamRepo.findByIdOrNull.mockResolvedValue(team);
      const tournament = buildTournament({
        tierList: buildTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({
        teams: [team],
        counter: 0,
        channelId: "channel-1",
      });

      await engine.skipCurrentPick(tournament, draft);

      expect(discordService.sendMessage).toHaveBeenCalledWith(
        "channel-1",
        expect.objectContaining({
          content: expect.stringContaining("Team Rocket"),
        }),
      );
    });
  });

  describe("setDraftState", () => {
    it("play: marks the draft IN_PROGRESS, sets a skip timer, and resumes the agenda timer", async () => {
      const team = buildTeam();
      const tournament = buildTournament({
        tierList: buildTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team], status: "PAUSED", counter: 0 });

      await engine.setDraftState(tournament, draft, "play");

      expect(draft.status).toBe("IN_PROGRESS");
      expect(draft.save).toHaveBeenCalled();
      expect(agendaService.resumeSkipPick).toHaveBeenCalledWith(
        tournament,
        draft,
      );
      expect(draftEvents.emitDraftStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: "IN_PROGRESS" }),
      );
    });

    it("pause: marks the draft PAUSED, clears the skip timer, and cancels the agenda timer", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [],
        status: "IN_PROGRESS",
        skipTime: new Date(Date.now() + 30_000),
      });

      await engine.setDraftState(tournament, draft, "pause");

      expect(draft.status).toBe("PAUSED");
      expect(draft.skipTime).toBeUndefined();
      expect(agendaService.cancelSkipPick).toHaveBeenCalledWith(draft);
      expect(draftEvents.emitDraftStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PAUSED" }),
      );
    });

    it("does nothing for an unrecognized state", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [] });

      await engine.setDraftState(tournament, draft, "not-a-real-state");

      expect(draft.save).not.toHaveBeenCalled();
      expect(draftEvents.emitDraftStatus).not.toHaveBeenCalled();
    });
  });
});
