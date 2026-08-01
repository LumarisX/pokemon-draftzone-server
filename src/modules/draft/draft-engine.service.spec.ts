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
      emitDraftPickUpdated: jest.fn(),
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
      const tournament = buildTournament();
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const draft = buildDraft({
        teams: [team],
        sequentialTurns: true,
        allowRemovals: false,
      });

      await expect(
        engine.undraftPokemon(tournament, draft, team, "pikachu"),
      ).rejects.toThrow("Draft does not allow removals.");
    });

    it("lets an organizer remove a pick even when removals are off", async () => {
      const tournament = buildTournament();
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const draft = buildDraft({
        teams: [team],
        sequentialTurns: true,
        allowRemovals: false,
      });

      await engine.undraftPokemon(tournament, draft, team, "pikachu", true);

      expect(team.pickLog).toHaveLength(0);
      expect(team.save).toHaveBeenCalled();
    });

    it("broadcasts the cleared slot so open boards re-sync", async () => {
      const tournament = buildTournament();
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const draft = buildDraft({ teams: [team], allowRemovals: true });

      await engine.undraftPokemon(tournament, draft, team, "pikachu", true);

      const [event] = draftEvents.emitDraftPickUpdated.mock.calls[0];
      expect(event).toMatchObject({
        round: 0,
        previous: expect.objectContaining({ id: "pikachu" }),
        team: expect.objectContaining({ draft: [] }),
      });
      // Absent `pokemon` is what tells a client the slot was cleared, not set.
      expect(event.pokemon).toBeUndefined();
    });

    it("announces an organizer removal in the draft channel", async () => {
      const tournament = buildTournament();
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const draft = buildDraft({
        teams: [team],
        allowRemovals: true,
        channelId: "channel-1",
      });

      await engine.undraftPokemon(tournament, draft, team, "pikachu", true);

      expect(discordService.sendMessage).toHaveBeenCalledWith(
        "channel-1",
        expect.objectContaining({
          content: expect.stringContaining("An organizer updated"),
        }),
      );
    });

    it("stays out of the draft channel when a coach removes their own pick", async () => {
      const tournament = buildTournament();
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const draft = buildDraft({
        teams: [team],
        allowRemovals: true,
        channelId: "channel-1",
      });

      await engine.undraftPokemon(tournament, draft, team, "pikachu");

      expect(discordService.sendMessage).not.toHaveBeenCalled();
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
      // Re-setting a slot to the Pokemon it already holds only works because the
      // slot is spliced out before the already-drafted check runs.
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team] });

      await engine.setPickAtRound(tournament, draft, team, 0, {
        pokemonId: "pikachu",
      });

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual(["pikachu"]);
    });

    it("lets an organizer put a team over the point total", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "charizard" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
        pointTotal: 5, // Pikachu costs 10 on its own
      });
      const draft = buildDraft({ teams: [team] });

      await engine.setPickAtRound(tournament, draft, team, 1, {
        pokemonId: "pikachu",
      });

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual([
        "charizard",
        "pikachu",
      ]);
    });

    it("lets an organizer strand a tier requirement", async () => {
      // Last open slot with an unmet S requirement — a coach could not spend it
      // on an A-tier mon, but an organizer correcting the roster can.
      const team = buildTeam({ pickLog: [{ pokemon: { id: "charizard" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
        tierRequirements: [{ tierName: "S", required: 1 }],
      });
      const draft = buildDraft({ teams: [team] });

      await engine.setPickAtRound(tournament, draft, team, 1, {
        pokemonId: "blastoise",
      });

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual([
        "charizard",
        "blastoise",
      ]);
    });

    it("restores the replaced pick when the new one is rejected", async () => {
      const rival = buildTeam({
        teamName: "Rival",
        pickLog: [{ pokemon: { id: "pikachu" } }],
      });
      const team = buildTeam({ pickLog: [{ pokemon: { id: "charizard" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team, rival] });

      await expect(
        engine.setPickAtRound(tournament, draft, team, 0, {
          pokemonId: "pikachu",
        }),
      ).rejects.toThrow("already been drafted");

      expect(team.pickLog.map((p: any) => p.pokemon.id)).toEqual(["charizard"]);
      expect(team.save).not.toHaveBeenCalled();
    });

    it("refuses a Pokemon that is not on the tier list", async () => {
      const team = buildTeam({ pickLog: [] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team] });

      await expect(
        engine.setPickAtRound(tournament, draft, team, 0, {
          pokemonId: "mewtwo",
        }),
      ).rejects.toThrow("not on this tier list");
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

    it("advances the draft when the edit fills the turn on the clock", async () => {
      const onClock = buildTeam({ teamName: "On Clock", pickLog: [] });
      const next = buildTeam({ teamName: "Next Up", pickLog: [] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      const draft = buildDraft({ teams: [onClock, next], counter: 0 });

      await engine.setPickAtRound(tournament, draft, onClock, 0, {
        pokemonId: "pikachu",
      });

      expect(draft.counter).toBe(1);
      expect(draftEvents.emitDraftCounter).toHaveBeenCalled();
    });

    it("leaves the counter alone when correcting an earlier round", async () => {
      const team = buildTeam({
        teamName: "On Clock",
        pickLog: [{ pokemon: { id: "pikachu" } }],
      });
      const next = buildTeam({ teamName: "Next Up", pickLog: [] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      // Counter is on round 0 position 0, but that slot is already filled — a
      // replacement there is a correction, not a turn being taken.
      const draft = buildDraft({ teams: [team, next], counter: 0 });

      await engine.setPickAtRound(tournament, draft, team, 0, {
        pokemonId: "charizard",
      });

      expect(draft.counter).toBe(0);
      expect(draftEvents.emitDraftCounter).not.toHaveBeenCalled();
    });

    it("announces the edit in the draft channel", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      const tournament = buildTournament({
        tierList: threeMonTierList(),
        draftCount: new DraftCount({ min: 1, max: 3 }),
      });
      const draft = buildDraft({ teams: [team], channelId: "channel-1" });

      await engine.setPickAtRound(tournament, draft, team, 0, {
        pokemonId: "charizard",
      });

      expect(discordService.sendMessage).toHaveBeenCalledWith(
        "channel-1",
        expect.objectContaining({
          content: expect.stringContaining("An organizer updated"),
        }),
      );
      expect(draftEvents.emitDraftPickUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          round: 0,
          pokemon: expect.objectContaining({ id: "charizard" }),
          previous: expect.objectContaining({ id: "pikachu" }),
        }),
      );
    });
  });

  describe("setCurrentPick", () => {
    it("moves the counter to the requested round and position", async () => {
      const first = buildTeam({ teamName: "First" });
      const second = buildTeam({ teamName: "Second" });
      const tournament = buildTournament({
        draftCount: new DraftCount({ min: 1, max: 4 }),
      });
      const draft = buildDraft({ teams: [first, second], counter: 5 });

      await engine.setCurrentPick(tournament, draft, 1, 1);

      expect(draft.counter).toBe(3);
      expect(draft.save).toHaveBeenCalled();
      expect(draftEvents.emitDraftCounter).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPick: expect.objectContaining({ round: 1, position: 1 }),
        }),
      );
    });

    it("restarts the clock while the draft is running", async () => {
      const team = buildTeam({ skipCount: 0 });
      const tournament = buildTournament({
        draftCount: new DraftCount({ min: 1, max: 4 }),
      });
      const draft = buildDraft({
        teams: [team],
        counter: 3,
        timerLength: 120,
        status: "IN_PROGRESS",
      });

      await engine.setCurrentPick(tournament, draft, 1, 0);

      expect(draft.skipTime!.getTime()).toBeGreaterThan(Date.now());
      expect(draft.remainingTime).toBeUndefined();
      expect(agendaService.resumeSkipPick).toHaveBeenCalled();
    });

    it("banks a full turn instead of a deadline while paused", async () => {
      const team = buildTeam({ skipCount: 0 });
      const tournament = buildTournament({
        draftCount: new DraftCount({ min: 1, max: 4 }),
      });
      const draft = buildDraft({
        teams: [team],
        counter: 3,
        timerLength: 120,
        status: "PAUSED",
      });

      await engine.setCurrentPick(tournament, draft, 1, 0);

      expect(draft.skipTime).toBeUndefined();
      expect(draft.remainingTime).toBe(120);
    });

    it("refuses a position past the last team", async () => {
      const team = buildTeam();
      const tournament = buildTournament({
        draftCount: new DraftCount({ min: 1, max: 4 }),
      });
      const draft = buildDraft({ teams: [team] });

      await expect(
        engine.setCurrentPick(tournament, draft, 0, 1),
      ).rejects.toThrow("Position must be between 1 and 1.");
    });

    it("refuses a round past the end of the draft", async () => {
      const team = buildTeam();
      const tournament = buildTournament({
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({ teams: [team] });

      await expect(
        engine.setCurrentPick(tournament, draft, 2, 0),
      ).rejects.toThrow("Round must be between 1 and 2.");
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

    it("play: pings the coach who is on the clock so the draft opens with a turn call", async () => {
      discordService.resolveMention.mockResolvedValue("<@ash>");
      const team = buildTeam();
      const tournament = buildTournament({
        tierList: buildTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({
        teams: [team],
        status: "PRE_DRAFT",
        counter: 0,
        channelId: "channel-1",
      });

      await engine.setDraftState(tournament, draft, "play");

      expect(discordService.sendMessage).toHaveBeenCalledWith("channel-1", {
        content: "The draft is now started. <@ash>, it is now your turn!",
      });
    });

    it("play: names the team when the coach has no resolvable Discord mention", async () => {
      const team = buildTeam();
      const tournament = buildTournament({
        tierList: buildTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({
        teams: [team],
        status: "PRE_DRAFT",
        counter: 0,
        channelId: "channel-1",
      });

      await engine.setDraftState(tournament, draft, "play");

      expect(discordService.sendMessage).toHaveBeenCalledWith("channel-1", {
        content: "The draft is now started. Team Rocket, it is now your turn!",
      });
    });

    it("play: skips the turn call when turns aren't sequential", async () => {
      const team = buildTeam();
      const tournament = buildTournament({
        tierList: buildTierList(),
        draftCount: new DraftCount({ min: 1, max: 2 }),
      });
      const draft = buildDraft({
        teams: [team],
        status: "PRE_DRAFT",
        sequentialTurns: false,
        counter: 0,
        channelId: "channel-1",
      });

      await engine.setDraftState(tournament, draft, "play");

      expect(discordService.sendMessage).toHaveBeenCalledWith("channel-1", {
        content: "The draft is now started.",
      });
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

  describe("updateSettings", () => {
    it("updates name, channelId, visibility, and allowRemovals regardless of status", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [],
        status: "IN_PROGRESS",
        name: "Old Name",
        channelId: "old-channel",
        visibility: "ALL",
        allowRemovals: false,
      });

      await engine.updateSettings(tournament, draft, {
        name: "New Name",
        channelId: "new-channel",
        visibility: "SELF",
        allowRemovals: true,
      });

      expect(draft.name).toBe("New Name");
      expect(draft.channelId).toBe("new-channel");
      expect(draft.visibility).toBe("SELF");
      expect(draft.allowRemovals).toBe(true);
      expect(draft.save).toHaveBeenCalled();
    });

    it("clears channelId when explicitly set to null", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [],
        status: "PRE_DRAFT",
        channelId: "old-channel",
      });

      await engine.updateSettings(tournament, draft, { channelId: null });

      expect(draft.channelId).toBeUndefined();
      expect(draft.save).toHaveBeenCalled();
    });

    it("leaves channelId untouched when omitted", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [],
        status: "PRE_DRAFT",
        channelId: "old-channel",
      });

      await engine.updateSettings(tournament, draft, { name: "New Name" });

      expect(draft.channelId).toBe("old-channel");
    });

    it("rejects turn-order changes (orderProgression/sequentialTurns) once the draft is no longer pre-draft", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [], status: "IN_PROGRESS" });

      await expect(
        engine.updateSettings(tournament, draft, { orderProgression: "linear" }),
      ).rejects.toThrow();
      await expect(
        engine.updateSettings(tournament, draft, { sequentialTurns: false }),
      ).rejects.toThrow();
      expect(draft.save).not.toHaveBeenCalled();
    });

    it("allows turn-order changes while pre-draft (including legacy NOT_STARTED)", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [],
        status: "NOT_STARTED",
        orderProgression: "snake",
        sequentialTurns: true,
      });

      await engine.updateSettings(tournament, draft, {
        orderProgression: "linear",
        sequentialTurns: false,
      });

      expect(draft.orderProgression).toBe("linear");
      expect(draft.sequentialTurns).toBe(false);
      expect(draft.save).toHaveBeenCalled();
    });
  });

  describe("sendTestMessage", () => {
    it("returns false without calling Discord when there's no channelId", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [], channelId: undefined });

      const result = await engine.sendTestMessage(tournament, draft);

      expect(result).toBe(false);
      expect(discordService.sendMessage).not.toHaveBeenCalled();
    });

    it("sends a test message and returns the Discord service's result", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [],
        name: "Spring Draft",
        channelId: "channel-1",
      });
      (discordService.sendMessage as jest.Mock).mockResolvedValueOnce(true);

      const result = await engine.sendTestMessage(tournament, draft);

      expect(result).toBe(true);
      expect(discordService.sendMessage).toHaveBeenCalledWith(
        "channel-1",
        expect.objectContaining({ content: expect.stringContaining("Spring Draft") }),
      );
    });

    it("propagates a false result when Discord can't deliver the message", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [], channelId: "channel-1" });
      (discordService.sendMessage as jest.Mock).mockResolvedValueOnce(false);

      const result = await engine.sendTestMessage(tournament, draft);

      expect(result).toBe(false);
    });
  });

  describe("setDraftOrder", () => {
    it("rejects changes once the draft is no longer PRE_DRAFT", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({ teams: [], status: "IN_PROGRESS" });

      await expect(
        engine.setDraftOrder(tournament, draft, { useRandomSeeding: true }),
      ).rejects.toThrow();
      expect(draft.save).not.toHaveBeenCalled();
    });

    it("accepts changes on a legacy draft whose status is NOT_STARTED rather than PRE_DRAFT", async () => {
      const teamA = buildTeam();
      const teamB = buildTeam();
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [teamA, teamB],
        status: "NOT_STARTED",
        useRandomSeeding: true,
      });
      const order = [teamB._id.toString(), teamA._id.toString()];

      await engine.setDraftOrder(tournament, draft, {
        useRandomSeeding: false,
        order,
      });

      expect(draft.useRandomSeeding).toBe(false);
      expect(draft.save).toHaveBeenCalled();
    });

    it("switches to random seeding without requiring an order", async () => {
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [],
        status: "PRE_DRAFT",
        useRandomSeeding: false,
      });

      await engine.setDraftOrder(tournament, draft, { useRandomSeeding: true });

      expect(draft.useRandomSeeding).toBe(true);
      expect(draft.save).toHaveBeenCalled();
    });

    it("rejects a manual order that isn't a permutation of the draft's teams", async () => {
      const teamA = buildTeam();
      const teamB = buildTeam();
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [teamA, teamB],
        status: "PRE_DRAFT",
        useRandomSeeding: true,
      });

      await expect(
        engine.setDraftOrder(tournament, draft, {
          useRandomSeeding: false,
          order: [teamA._id.toString()],
        }),
      ).rejects.toThrow();
      expect(draft.save).not.toHaveBeenCalled();
    });

    it("saves a valid manual order and turns off random seeding", async () => {
      const teamA = buildTeam();
      const teamB = buildTeam();
      const tournament = buildTournament();
      const draft = buildDraft({
        teams: [teamA, teamB],
        status: "PRE_DRAFT",
        useRandomSeeding: true,
      });
      const order = [teamB._id.toString(), teamA._id.toString()];

      await engine.setDraftOrder(tournament, draft, {
        useRandomSeeding: false,
        order,
      });

      expect(draft.useRandomSeeding).toBe(false);
      expect(draft.teamOrder.map((id: Types.ObjectId) => id.toString())).toEqual(
        order,
      );
      expect(draft.save).toHaveBeenCalled();
    });
  });
});
