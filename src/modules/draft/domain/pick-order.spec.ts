import { Types } from "mongoose";
import {
  buildDraftBoards,
  calculateCanDraft,
  calculateCanDraftCounts,
  calculateCurrentPick,
  calculateTeamTimer,
  cancelSkipTime,
  canTeamDraft,
  generatePickOrder,
  getCurrentPickingTeam,
  getCurrentPositionInRound,
  getCurrentRound,
  getDocumentId,
  getDraftOrder,
  getPokemonIdFromDraft,
  isAlreadyDrafted,
} from "./pick-order";

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    pickLog: [],
    picks: [],
    skipCount: 0,
    ...overrides,
  } as any;
}

function buildDraft(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    status: "IN_PROGRESS",
    sequentialTurns: true,
    orderProgression: "snake",
    useRandomSeeding: false,
    counter: 0,
    teams: [],
    ...overrides,
  } as any;
}

function pick(pokemonId: string) {
  return { pokemon: { id: pokemonId }, timestamp: new Date() };
}

describe("getPokemonIdFromDraft", () => {
  it("returns the picked Pokemon's id", () => {
    expect(getPokemonIdFromDraft(pick("pikachu") as any)).toBe("pikachu");
  });
});

describe("getDocumentId", () => {
  it("stringifies a bare ObjectId", () => {
    const id = new Types.ObjectId();
    expect(getDocumentId(id)).toBe(id.toString());
  });

  it("stringifies a document's _id", () => {
    const id = new Types.ObjectId();
    expect(getDocumentId({ _id: id })).toBe(id.toString());
  });
});

describe("getDraftOrder", () => {
  it("returns the same array reference when there's only one team", () => {
    const teams = [buildTeam()];
    const draft = buildDraft({ teams, useRandomSeeding: true });

    expect(getDraftOrder(draft)).toBe(teams);
  });

  it("returns the same array reference when random seeding is disabled", () => {
    const teams = [buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, useRandomSeeding: false });

    expect(getDraftOrder(draft)).toBe(teams);
  });

  it("deterministically shuffles teams based on the draft's own id", () => {
    const teamA = buildTeam({ _id: new Types.ObjectId("000000000000000000000001"), teamName: "A" });
    const teamB = buildTeam({ _id: new Types.ObjectId("000000000000000000000002"), teamName: "B" });
    const teamC = buildTeam({ _id: new Types.ObjectId("000000000000000000000003"), teamName: "C" });
    const teamD = buildTeam({ _id: new Types.ObjectId("000000000000000000000004"), teamName: "D" });
    const draft = buildDraft({
      _id: new Types.ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      teams: [teamA, teamB, teamC, teamD],
      useRandomSeeding: true,
    });

    const result = getDraftOrder(draft);

    expect(result.map((t: any) => t.teamName)).toEqual(["C", "A", "B", "D"]);
    // Same input always produces the same order (seeded by draft._id).
    expect(getDraftOrder(draft).map((t: any) => t.teamName)).toEqual(["C", "A", "B", "D"]);
  });

  it("produces a permutation (never drops or duplicates a team)", () => {
    const teams = [buildTeam(), buildTeam(), buildTeam(), buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, useRandomSeeding: true });

    const result = getDraftOrder(draft);

    expect(result).toHaveLength(teams.length);
    expect(new Set(result)).toEqual(new Set(teams));
  });
});

describe("generatePickOrder", () => {
  const teams = [buildTeam({ teamName: "A" }), buildTeam({ teamName: "B" }), buildTeam({ teamName: "C" })];

  it("repeats the same order every round for linear progression", () => {
    const result = generatePickOrder(teams, 3, "linear");

    expect(result.map((t: any) => t.teamName)).toEqual([
      "A", "B", "C",
      "A", "B", "C",
      "A", "B", "C",
    ]);
  });

  it("reverses every odd round for snake progression", () => {
    const result = generatePickOrder(teams, 3, "snake");

    expect(result.map((t: any) => t.teamName)).toEqual([
      "A", "B", "C",
      "C", "B", "A",
      "A", "B", "C",
    ]);
  });

  it("returns an empty array for zero rounds", () => {
    expect(generatePickOrder(teams, 0, "snake")).toEqual([]);
  });
});

describe("buildDraftBoards", () => {
  it("builds a flat board with each team's picks filled in by pick order", async () => {
    const teamA = buildTeam({ teamName: "A", pickLog: [pick("pikachu")] });
    const teamB = buildTeam({ teamName: "B", pickLog: [] });
    const draft = buildDraft({ teams: [teamA, teamB] });
    const pickOrder = generatePickOrder([teamA, teamB], 2, "snake");

    const { flatDraftBoard } = await buildDraftBoards(draft, pickOrder);

    expect(flatDraftBoard).toEqual([
      { teamName: "A", pokemon: { id: "pikachu", name: "Pikachu" } },
      { teamName: "B" },
      { teamName: "B" },
      { teamName: "A" },
    ]);
  });

  it("splits the flat board into rounds of `teams.length` picks each", async () => {
    const teamA = buildTeam({ teamName: "A" });
    const teamB = buildTeam({ teamName: "B" });
    const draft = buildDraft({ teams: [teamA, teamB] });
    const pickOrder = generatePickOrder([teamA, teamB], 2, "snake");

    const { draftRounds } = await buildDraftBoards(draft, pickOrder);

    expect(draftRounds).toHaveLength(2);
    expect(draftRounds[0]).toHaveLength(2);
    expect(draftRounds[1]).toHaveLength(2);
  });

  it("advances each team's own cursor independently as its picks are consumed", async () => {
    const teamA = buildTeam({
      teamName: "A",
      pickLog: [pick("pikachu"), pick("charizard")],
    });
    const teamB = buildTeam({ teamName: "B", pickLog: [pick("bulbasaur")] });
    const draft = buildDraft({ teams: [teamA, teamB] });
    const pickOrder = generatePickOrder([teamA, teamB], 2, "snake");

    const { flatDraftBoard } = await buildDraftBoards(draft, pickOrder);

    // order: A, B, B, A (snake) -> A's 1st pick, B's 1st pick, B has no 2nd pick, A's 2nd pick
    expect(flatDraftBoard[0].pokemon?.id).toBe("pikachu");
    expect(flatDraftBoard[1].pokemon?.id).toBe("bulbasaur");
    expect(flatDraftBoard[2].pokemon).toBeUndefined();
    expect(flatDraftBoard[3].pokemon?.id).toBe("charizard");
  });
});

describe("calculateCanDraft", () => {
  it("returns an empty array when the draft isn't in progress", () => {
    const teams = [buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, status: "PAUSED" });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    expect(calculateCanDraft(draft, pickOrder)).toEqual([]);
  });

  it("lets every team draft at once when turns aren't sequential (one entry per pick slot)", () => {
    const teams = [buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, sequentialTurns: false });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    const result = calculateCanDraft(draft, pickOrder);

    expect(result).toEqual(pickOrder.map((t: any) => t._id.toString()));
  });

  it("only allows the current picker at the start of a sequential snake draft", () => {
    const teamA = buildTeam({ teamName: "A" });
    const teamB = buildTeam({ teamName: "B" });
    const teamC = buildTeam({ teamName: "C" });
    const teams = [teamA, teamB, teamC];
    const draft = buildDraft({ teams, counter: 0 });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    expect(calculateCanDraft(draft, pickOrder)).toEqual([teamA._id.toString()]);
  });

  it("allows a lagging team to catch up alongside the current picker", () => {
    // Counter is at 1 (B's turn), but A hasn't actually recorded its round-0 pick yet.
    const teamA = buildTeam({ teamName: "A", pickLog: [] });
    const teamB = buildTeam({ teamName: "B", pickLog: [] });
    const teamC = buildTeam({ teamName: "C", pickLog: [] });
    const teams = [teamA, teamB, teamC];
    const draft = buildDraft({ teams, counter: 1 });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    const result = calculateCanDraft(draft, pickOrder);

    expect(result.sort()).toEqual(
      [teamA._id.toString(), teamB._id.toString()].sort(),
    );
  });

  it("excludes a team that has already used its expected pick(s)", () => {
    const teamA = buildTeam({ teamName: "A", pickLog: [pick("pikachu")] });
    const teamB = buildTeam({ teamName: "B", pickLog: [] });
    const teamC = buildTeam({ teamName: "C", pickLog: [] });
    const teams = [teamA, teamB, teamC];
    const draft = buildDraft({ teams, counter: 1 });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    const result = calculateCanDraft(draft, pickOrder);

    expect(result).toEqual([teamB._id.toString()]);
  });

  it("returns an empty array for linear progression (not yet implemented)", () => {
    const teams = [buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, orderProgression: "linear" });
    const pickOrder = generatePickOrder(teams, 2, "linear");

    expect(calculateCanDraft(draft, pickOrder)).toEqual([]);
  });
});

describe("calculateCanDraftCounts", () => {
  it("returns an empty map when the draft isn't in progress", () => {
    const teams = [buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, status: "PAUSED" });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    expect(calculateCanDraftCounts(draft, pickOrder)).toEqual({});
  });

  it("gives every team every remaining round at once when turns aren't sequential", () => {
    const teamA = buildTeam({ teamName: "A" });
    const teamB = buildTeam({ teamName: "B" });
    const teams = [teamA, teamB];
    const draft = buildDraft({ teams, sequentialTurns: false });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    // No turn order to wait on, so both of A and B's 2 rounds are draftable now.
    expect(calculateCanDraftCounts(draft, pickOrder)).toEqual({
      [teamA._id.toString()]: 2,
      [teamB._id.toString()]: 2,
    });
  });

  it("excludes a team that has used all its rounds when turns aren't sequential", () => {
    const teamA = buildTeam({
      teamName: "A",
      pickLog: [pick("pikachu")],
    });
    const teamB = buildTeam({ teamName: "B", pickLog: [] });
    const teams = [teamA, teamB];
    const draft = buildDraft({ teams, sequentialTurns: false });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    expect(calculateCanDraftCounts(draft, pickOrder)).toEqual({
      [teamA._id.toString()]: 1,
      [teamB._id.toString()]: 2,
    });
  });

  it("gives the current picker a count of 1 with no backlog", () => {
    const teamA = buildTeam({ teamName: "A" });
    const teamB = buildTeam({ teamName: "B" });
    const teamC = buildTeam({ teamName: "C" });
    const teams = [teamA, teamB, teamC];
    const draft = buildDraft({ teams, counter: 0 });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    expect(calculateCanDraftCounts(draft, pickOrder)).toEqual({
      [teamA._id.toString()]: 1,
    });
  });

  it("gives a lagging team a count of 2 to catch up on a full backlog", () => {
    // order: A, B, C, C, B, A. Counter is at 5 (A's 2nd turn), but A never
    // recorded its round-0 pick, so it owes 2 picks; B and C kept up.
    const teamA = buildTeam({ teamName: "A", pickLog: [] });
    const teamB = buildTeam({
      teamName: "B",
      pickLog: [pick("squirtle"), pick("wartortle")],
    });
    const teamC = buildTeam({
      teamName: "C",
      pickLog: [pick("charmander"), pick("charmeleon")],
    });
    const teams = [teamA, teamB, teamC];
    const draft = buildDraft({ teams, counter: 5 });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    expect(calculateCanDraftCounts(draft, pickOrder)).toEqual({
      [teamA._id.toString()]: 2,
    });
  });

  it("excludes a team that has already used its expected pick(s)", () => {
    const teamA = buildTeam({ teamName: "A", pickLog: [pick("pikachu")] });
    const teamB = buildTeam({ teamName: "B", pickLog: [] });
    const teamC = buildTeam({ teamName: "C", pickLog: [] });
    const teams = [teamA, teamB, teamC];
    const draft = buildDraft({ teams, counter: 1 });
    const pickOrder = generatePickOrder(teams, 2, "snake");

    expect(calculateCanDraftCounts(draft, pickOrder)).toEqual({
      [teamB._id.toString()]: 1,
    });
  });

  it("returns an empty map for linear progression (not yet implemented)", () => {
    const teams = [buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, orderProgression: "linear" });
    const pickOrder = generatePickOrder(teams, 2, "linear");

    expect(calculateCanDraftCounts(draft, pickOrder)).toEqual({});
  });
});

describe("calculateCurrentPick / getCurrentRound / getCurrentPositionInRound", () => {
  it("derives round and position from counter and team count", () => {
    const teams = [buildTeam(), buildTeam(), buildTeam()];
    const draft = buildDraft({ teams, counter: 4 });

    expect(getCurrentRound(draft)).toBe(1);
    expect(getCurrentPositionInRound(draft)).toBe(1);
    expect(calculateCurrentPick(draft)).toEqual({
      round: 1,
      position: 1,
      skipTime: undefined,
    });
  });
});

describe("getCurrentPickingTeam", () => {
  const teamA = buildTeam({ teamName: "A" });
  const teamB = buildTeam({ teamName: "B" });
  const teamC = buildTeam({ teamName: "C" });
  const teams = [teamA, teamB, teamC];

  it("returns null when there are no teams", () => {
    const draft = buildDraft({ teams: [] });
    expect(getCurrentPickingTeam(draft)).toBeNull();
  });

  it("picks by position within the (non-reversed) round for an even round", () => {
    const draft = buildDraft({ teams, counter: 1 });
    expect(getCurrentPickingTeam(draft)?.teamName).toBe("B");
  });

  it("reverses the order for odd (snake) rounds", () => {
    const draft = buildDraft({ teams, counter: 3 }); // round 1, position 0
    expect(getCurrentPickingTeam(draft)?.teamName).toBe("C");
  });

  it("wraps the position via counter modulo team count rather than running off the end", () => {
    // With a single team, position is always counter % 1 === 0, so this
    // never actually returns null in practice (the length-guard inside
    // getCurrentPickingTeam is unreachable given how position is derived).
    const draft = buildDraft({ teams: [teamA], counter: 1 });
    expect(getCurrentPickingTeam(draft)?.teamName).toBe("A");
  });
});

describe("calculateTeamTimer", () => {
  it("returns the base timer when there have been no skips", () => {
    expect(calculateTeamTimer(120, 0)).toBe(120);
  });

  it("halves the timer per skip", () => {
    expect(calculateTeamTimer(120, 1)).toBe(60);
    expect(calculateTeamTimer(120, 2)).toBe(30);
  });

  it("never goes below the 30-second floor", () => {
    expect(calculateTeamTimer(120, 3)).toBe(30);
    expect(calculateTeamTimer(120, 10)).toBe(30);
  });

  it("defaults the base timer to 30 when undefined", () => {
    expect(calculateTeamTimer(undefined, 0)).toBe(30);
  });
});

describe("canTeamDraft", () => {
  const teamA = buildTeam({ teamName: "A" });
  const teamB = buildTeam({ teamName: "B" });
  const teamC = buildTeam({ teamName: "C" });
  const teams = [teamA, teamB, teamC];

  it("returns false when the draft isn't in progress", async () => {
    const draft = buildDraft({ teams, status: "PAUSED", counter: 1 });
    await expect(canTeamDraft(draft, teamB)).resolves.toBe(false);
  });

  it("allows the current picker who hasn't picked yet this round", async () => {
    const draft = buildDraft({ teams, counter: 1 });
    await expect(canTeamDraft(draft, teamB)).resolves.toBe(true);
  });

  it("disallows the current picker once they've already picked this round", async () => {
    const pickedB = buildTeam({ teamName: "B", pickLog: [pick("pikachu")] });
    const draft = buildDraft({ teams: [teamA, pickedB, teamC], counter: 1 });
    await expect(canTeamDraft(draft, pickedB)).resolves.toBe(false);
  });

  it("disallows a team whose turn in this round hasn't come up yet", async () => {
    const draft = buildDraft({ teams, counter: 1 });
    await expect(canTeamDraft(draft, teamC)).resolves.toBe(false);
  });

  it("allows any team immediately when turns aren't sequential", async () => {
    const draft = buildDraft({ teams, sequentialTurns: false });
    await expect(canTeamDraft(draft, teamA)).resolves.toBe(true);
    await expect(canTeamDraft(draft, teamC)).resolves.toBe(true);
  });

  it("allows a team that's behind to catch up", async () => {
    const draft = buildDraft({ teams, counter: 1 });
    await expect(canTeamDraft(draft, teamA)).resolves.toBe(true);
  });
});

describe("isAlreadyDrafted", () => {
  it("returns true when any team has picked the Pokemon", () => {
    const teamA = buildTeam({ pickLog: [pick("pikachu")] });
    const teamB = buildTeam({ pickLog: [] });
    const draft = buildDraft({ teams: [teamA, teamB] });

    expect(isAlreadyDrafted(draft, "pikachu")).toBe(true);
    expect(isAlreadyDrafted(draft, "charizard")).toBe(false);
  });
});

describe("cancelSkipTime", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sets remainingTime to the seconds left until skipTime", () => {
    const draft = buildDraft({ skipTime: new Date("2026-01-01T00:00:30.000Z") });

    cancelSkipTime(draft);

    expect(draft.remainingTime).toBe(30);
  });

  it("sets remainingTime to 0 when there is no skipTime", () => {
    const draft = buildDraft({ skipTime: undefined });

    cancelSkipTime(draft);

    expect(draft.remainingTime).toBe(0);
  });
});
