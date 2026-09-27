import {
  advancingSides,
  AdvancementMatchup,
  bracketExits,
  feedingMatchups,
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
    expect(resolved.get("r3")!.side1).toBe("alpha");
  });

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

  it("carries the survivor of a double forfeit's next match onward by walkover", () => {
    const resolved = resolveBracketAdvancement([
      { id: "semi", winner: "draw", side1: seed("alpha"), side2: seed("bravo") },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
      { id: "grand", side1: winnerOf("final"), side2: seed("delta") },
    ]);

    expect(resolved.get("grand")!.side1).toBe("charlie");
  });

  it("sends nobody to the loser slot of a walkover", () => {
    const resolved = resolveBracketAdvancement([
      { id: "semi", winner: "draw", side1: seed("alpha"), side2: seed("bravo") },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
      { id: "losers", side1: loserOf("final"), side2: seed("delta") },
    ]);

    expect(resolved.get("losers")!.side1).toBeNull();
  });

  it("walks a chain of two double forfeits down to the next real team", () => {
    const resolved = resolveBracketAdvancement([
      { id: "m2", winner: "draw", side1: seed("a"), side2: seed("b") },
      { id: "m3", winner: "draw", side1: seed("c"), side2: seed("d") },
      { id: "m13", side1: winnerOf("m2"), side2: winnerOf("m3") },
      { id: "m21", side1: winnerOf("m13"), side2: seed("e") },
      { id: "m30", side1: winnerOf("m21"), side2: seed("f") },
    ]);

    expect(resolved.get("m30")).toEqual({ side1: "e" });
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

  it("does not hang on an unplayed slot cycle", () => {
    const matchups: AdvancementMatchup[] = [
      { id: "a", side1: winnerOf("b"), side2: seed("alpha") },
      { id: "b", side1: winnerOf("a"), side2: seed("bravo") },
    ];

    expect(() => resolveBracketAdvancement(matchups)).not.toThrow();
  });
});

describe("bracketExits", () => {
  it("leaves a match still to be played open", () => {
    const exits = bracketExits([
      { id: "semi", side1: seed("alpha"), side2: seed("bravo") },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
    ]);

    expect(exits.get("final")).toMatchObject({
      settled: false,
      walkover: null,
    });
  });

  it("gives the next match to the side still standing after a double forfeit", () => {
    const exits = bracketExits([
      { id: "semi", winner: "draw", side1: seed("alpha"), side2: seed("bravo") },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
    ]);

    expect(exits.get("semi")).toMatchObject({ settled: true, walkover: null });
    expect(exits.get("final")).toEqual({
      winner: "side2",
      loser: null,
      settled: true,
      walkover: "side2",
    });
  });

  it("gives a walkover even while the surviving side is still undecided", () => {
    const exits = bracketExits([
      { id: "m2", winner: "draw", side1: seed("a"), side2: seed("b") },
      { id: "m4", side1: seed("c"), side2: seed("d") },
      { id: "m13", side1: winnerOf("m2"), side2: winnerOf("m4") },
    ]);

    expect(exits.get("m13")?.walkover).toBe("side2");
  });

  it("voids a match both of whose sides can never be filled", () => {
    const exits = bracketExits([
      { id: "m2", winner: "draw", side1: seed("a"), side2: seed("b") },
      { id: "m3", winner: "draw", side1: seed("c"), side2: seed("d") },
      { id: "m13", side1: winnerOf("m2"), side2: winnerOf("m3") },
      { id: "m21", side1: winnerOf("m13"), side2: seed("e") },
    ]);

    expect(exits.get("m13")).toEqual({
      winner: null,
      loser: null,
      settled: true,
      walkover: "void",
    });
    expect(exits.get("m21")?.walkover).toBe("side2");
  });

  it("treats a none ruling like a double forfeit downstream", () => {
    const exits = bracketExits([
      {
        id: "semi",
        winner: "side1",
        advances: "none",
        side1: seed("alpha"),
        side2: seed("bravo"),
      },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
    ]);

    expect(exits.get("final")?.walkover).toBe("side2");
  });

  it("lets a recorded result or a ruling override the walkover", () => {
    const exits = bracketExits([
      { id: "semi", winner: "draw", side1: seed("alpha"), side2: seed("bravo") },
      {
        id: "final",
        advances: "none",
        side1: winnerOf("semi"),
        side2: seed("charlie"),
      },
    ]);

    expect(exits.get("final")).toEqual({
      winner: null,
      loser: null,
      settled: true,
      walkover: null,
    });
  });

  it("strands the loser bracket slot a walkover leaves empty", () => {
    const exits = bracketExits([
      { id: "semi", winner: "draw", side1: seed("alpha"), side2: seed("bravo") },
      { id: "final", side1: winnerOf("semi"), side2: seed("charlie") },
      { id: "losers", side1: loserOf("final"), side2: seed("delta") },
    ]);

    expect(exits.get("losers")?.walkover).toBe("side2");
  });
});

describe("feedingMatchups", () => {
  it("names every match a winner or loser slot reads from", () => {
    const feeding = feedingMatchups([
      { id: "semi-a", side1: seed("a"), side2: seed("b") },
      { id: "semi-b", side1: seed("c"), side2: seed("d") },
      { id: "final", side1: winnerOf("semi-a"), side2: winnerOf("semi-b") },
      { id: "third", side1: loserOf("semi-a"), side2: seed("e") },
    ]);

    expect([...feeding].sort()).toEqual(["semi-a", "semi-b"]);
  });
});
