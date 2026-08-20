import {
  advancingSides,
  AdvancementMatchup,
  blockedMatchups,
  resolveBracketAdvancement,
} from "./advancement";

describe("advancingSides", () => {
  it("reads a normal result off the winner", () => {
    expect(advancingSides({ winner: "side1" })).toEqual({
      winner: "side1",
      loser: "side2",
    });
  });

  it("sends nobody onward from a double forfeit", () => {
    expect(advancingSides({ winner: "draw" })).toEqual({
      winner: null,
      loser: null,
    });
  });

  it("lets an override name the side that advances out of a draw", () => {
    expect(advancingSides({ winner: "draw", advances: "side2" })).toEqual({
      winner: "side2",
      loser: "side1",
    });
  });

  it("lets an override overrule a recorded winner", () => {
    expect(advancingSides({ winner: "side1", advances: "side2" })).toEqual({
      winner: "side2",
      loser: "side1",
    });
  });

  it('sends nobody onward on "none", whatever the result says', () => {
    expect(advancingSides({ winner: "side1", advances: "none" })).toEqual({
      winner: null,
      loser: null,
    });
  });
});

const seed = (team: string | null) => ({
  slot: { type: "seed" },
  team,
});
const winnerOf = (from: string, team: string | null = null) => ({
  slot: { type: "winner", matchId: from },
  team,
});
const loserOf = (from: string, team: string | null = null) => ({
  slot: { type: "loser", matchId: from },
  team,
});

describe("resolveBracketAdvancement", () => {
  /** Semis A/B feeding a final, plus a third-place match off the losers. */
  function bracket(
    overrides: Partial<AdvancementMatchup> = {},
  ): AdvancementMatchup[] {
    return [
      {
        id: "semi-a",
        winner: "side1",
        side1: seed("alpha"),
        side2: seed("bravo"),
        ...overrides,
      },
      {
        id: "semi-b",
        winner: "side2",
        side1: seed("charlie"),
        side2: seed("delta"),
      },
      {
        id: "final",
        side1: winnerOf("semi-a"),
        side2: winnerOf("semi-b"),
      },
      {
        id: "third",
        side1: loserOf("semi-a"),
        side2: loserOf("semi-b"),
      },
    ];
  }

  it("fills winner and loser slots from the results above them", () => {
    const resolved = resolveBracketAdvancement(bracket());

    expect(resolved.get("final")).toEqual({ side1: "alpha", side2: "delta" });
    expect(resolved.get("third")).toEqual({ side1: "bravo", side2: "charlie" });
  });

  it("leaves a double forfeit's downstream slot empty", () => {
    const resolved = resolveBracketAdvancement(
      bracket({
        id: "semi-a",
        winner: "draw",
        side1: seed("alpha"),
        side2: seed("bravo"),
      }),
    );

    expect(resolved.get("final")).toEqual({ side1: null, side2: "delta" });
  });

  it("advances the overridden side out of a double forfeit", () => {
    const resolved = resolveBracketAdvancement(
      bracket({
        id: "semi-a",
        winner: "draw",
        advances: "side2",
        side1: seed("alpha"),
        side2: seed("bravo"),
      }),
    );

    expect(resolved.get("final")).toEqual({ side1: "bravo", side2: "delta" });
    expect(resolved.get("third")).toEqual({ side1: "alpha", side2: "charlie" });
  });

  it("empties both downstream slots when nobody advances", () => {
    const resolved = resolveBracketAdvancement(
      bracket({
        id: "semi-a",
        winner: "draw",
        advances: "none",
        side1: seed("alpha"),
        side2: seed("bravo"),
      }),
    );

    expect(resolved.get("final")).toEqual({ side1: null, side2: "delta" });
    expect(resolved.get("third")).toEqual({ side1: null, side2: "charlie" });
  });

  // The correction the whole feature exists to make: a slot filled by an
  // earlier, wrong answer has to empty again when the answer is withdrawn.
  it("clears a slot a withdrawn override had already filled", () => {
    const matchups = bracket({
      id: "semi-a",
      winner: "draw",
      side1: seed("alpha"),
      side2: seed("bravo"),
    });
    const final = matchups.find((m) => m.id === "final")!;
    final.side1 = winnerOf("semi-a", "bravo");

    expect(resolveBracketAdvancement(matchups).get("final")).toEqual({
      side1: null,
      side2: "delta",
    });
  });

  it("carries a correction through a match that was already decided", () => {
    const matchups: AdvancementMatchup[] = [
      {
        id: "r1",
        winner: "draw",
        advances: "side1",
        side1: seed("alpha"),
        side2: seed("bravo"),
      },
      {
        id: "r2",
        winner: "side1",
        side1: winnerOf("r1", "bravo"),
        side2: seed("charlie"),
      },
      { id: "r3", side1: winnerOf("r2", "bravo"), side2: seed("delta") },
    ];

    const resolved = resolveBracketAdvancement(matchups);
    expect(resolved.get("r2")!.side1).toBe("alpha");
    // Two hops down: r3 takes r2's winner, which is r2's side1 — now alpha.
    expect(resolved.get("r3")!.side1).toBe("alpha");
  });

  // The organizer's other route out of a stranded match: rather than an
  // advancement override, record a real forfeit win for the side that does have
  // a team. The resolver reads `winner`, so that advances them just the same.
  it("advances the side given a forfeit win over an empty slot", () => {
    const resolved = resolveBracketAdvancement([
      { id: "m13", side1: winnerOf("m2"), side2: winnerOf("m3") },
      {
        id: "m21",
        winner: "side2",
        side1: winnerOf("m13"),
        side2: seed("dunsparces"),
      },
      { id: "m30", side1: winnerOf("m21"), side2: seed("other") },
    ]);

    expect(resolved.get("m30")!.side1).toBe("dunsparces");
    expect(resolved.get("m21")!.side1).toBeNull();
  });

  it("leaves seed slots alone", () => {
    const resolved = resolveBracketAdvancement(bracket());
    expect(resolved.has("semi-a")).toBe(false);
  });

  it("does not hang on a slot cycle", () => {
    const matchups: AdvancementMatchup[] = [
      { id: "a", winner: "side1", side1: winnerOf("b"), side2: seed("alpha") },
      { id: "b", winner: "side1", side1: winnerOf("a"), side2: seed("bravo") },
    ];

    expect(() => resolveBracketAdvancement(matchups)).not.toThrow();
  });
});

describe("blockedMatchups", () => {
  it("flags a stranded double forfeit that something downstream waits on", () => {
    const blocked = blockedMatchups([
      {
        id: "semi",
        winner: "draw",
        side1: seed("alpha"),
        side2: seed("bravo"),
      },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
    ]);

    expect([...blocked]).toEqual(["semi"]);
  });

  // A double forfeit in the last match decides nothing further; there is
  // nothing for an organizer to unstick.
  it("ignores a double forfeit nothing is waiting on", () => {
    const blocked = blockedMatchups([
      {
        id: "final",
        winner: "draw",
        side1: seed("alpha"),
        side2: seed("bravo"),
      },
    ]);

    expect(blocked.size).toBe(0);
  });

  it("stops flagging once the organizer has answered", () => {
    const blocked = blockedMatchups([
      {
        id: "semi",
        winner: "draw",
        advances: "side1",
        side1: seed("alpha"),
        side2: seed("bravo"),
      },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
    ]);

    expect(blocked.size).toBe(0);
  });

  it("does not flag a match that is simply still to be played", () => {
    const blocked = blockedMatchups([
      { id: "semi", side1: seed("alpha"), side2: seed("bravo") },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
    ]);

    expect(blocked.size).toBe(0);
  });

  // The second round of the fix. Ruling that nobody advances leaves the next
  // match with a side no result can ever fill, so it cannot be played either —
  // and it too has to be findable, or "none" just moves the lock down a round.
  it("flags the match a `none` ruling stranded one round later", () => {
    const blocked = blockedMatchups([
      {
        id: "semi",
        winner: "draw",
        advances: "none",
        side1: seed("alpha"),
        side2: seed("bravo"),
      },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
      { id: "grand", side1: winnerOf("final"), side2: seed("delta") },
    ]);

    expect([...blocked]).toEqual(["final"]);
  });

  // Straight from a live bracket: two double forfeits feed one match, which
  // therefore has nobody to play it, which strands the match after it in turn.
  // Every one of them needs an organizer's call, so every one has to be found.
  it("flags a whole chain stranded by two double forfeits", () => {
    const blocked = blockedMatchups([
      { id: "m2", winner: "draw", side1: seed("a"), side2: seed("b") },
      { id: "m3", winner: "draw", side1: seed("c"), side2: seed("d") },
      { id: "m13", side1: winnerOf("m2"), side2: winnerOf("m3") },
      { id: "m21", side1: winnerOf("m13"), side2: seed("e") },
      { id: "m30", side1: winnerOf("m21"), side2: seed("f") },
    ]);

    expect([...blocked].sort()).toEqual(["m13", "m2", "m21", "m3"]);
  });

  it("clears the whole chain once the forfeits at the top are ruled on", () => {
    const blocked = blockedMatchups([
      {
        id: "m2",
        winner: "draw",
        advances: "side1",
        side1: seed("a"),
        side2: seed("b"),
      },
      {
        id: "m3",
        winner: "draw",
        advances: "side2",
        side1: seed("c"),
        side2: seed("d"),
      },
      { id: "m13", side1: winnerOf("m2"), side2: winnerOf("m3") },
      { id: "m21", side1: winnerOf("m13"), side2: seed("e") },
    ]);

    expect(blocked.size).toBe(0);
  });

  it("stops flagging a stranded match once a forfeit win is recorded on it", () => {
    const blocked = blockedMatchups([
      { id: "m13", side1: winnerOf("m2"), side2: winnerOf("m3") },
      {
        id: "m21",
        winner: "side2",
        side1: winnerOf("m13"),
        side2: seed("dunsparces"),
      },
      { id: "m30", side1: winnerOf("m21"), side2: seed("other") },
    ]);

    expect(blocked.has("m21")).toBe(false);
  });

  it("stops flagging the stranded match once its own advancement is set", () => {
    const blocked = blockedMatchups([
      {
        id: "semi",
        winner: "draw",
        advances: "none",
        side1: seed("alpha"),
        side2: seed("bravo"),
      },
      {
        id: "final",
        advances: "side2",
        side1: winnerOf("semi"),
        side2: seed("charlie"),
      },
      { id: "grand", side1: winnerOf("final"), side2: seed("delta") },
    ]);

    expect(blocked.size).toBe(0);
  });
});
