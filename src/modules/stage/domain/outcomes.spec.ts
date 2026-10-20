import { AdvancementMatchup } from "./advancement";
import { computeOutcomes, TeamOutcome } from "./outcomes";

type SlotSpec = { team?: string; from?: [string, "winner" | "loser"] };

function match(
  id: string,
  side1: SlotSpec,
  side2: SlotSpec,
  winner?: "side1" | "side2",
): AdvancementMatchup {
  const side = (spec: SlotSpec) => ({
    team: spec.team ?? null,
    slot: spec.from
      ? { type: spec.from[1], matchId: spec.from[0] }
      : { type: "seed" },
  });
  return { id, side1: side(side1), side2: side(side2), winner: winner ?? null };
}

const order = ["A", "B", "C", "D", "E", "F"];

function fourTeamBracket(finalWinner?: "side1" | "side2") {
  return [
    match("sf1", { team: "A" }, { team: "D" }, "side1"),
    match("sf2", { team: "B" }, { team: "C" }, "side2"),
    match(
      "final",
      { team: "A", from: ["sf1", "winner"] },
      { team: "C", from: ["sf2", "winner"] },
      finalWinner,
    ),
  ];
}

function doubleElimination(gfWinner: "side1" | "side2", resetWinner?: "side1" | "side2") {
  return [
    match("w1-0", { team: "A" }, { team: "D" }, "side1"),
    match("w1-1", { team: "B" }, { team: "C" }, "side1"),
    match("w2-0", { team: "A", from: ["w1-0", "winner"] }, { team: "B", from: ["w1-1", "winner"] }, "side1"),
    match("x1-0", { team: "D", from: ["w1-0", "loser"] }, { team: "C", from: ["w1-1", "loser"] }, "side2"),
    match("x1-1", { team: "B", from: ["w2-0", "loser"] }, { team: "C", from: ["x1-0", "winner"] }, "side1"),
    match("gf", { team: "A", from: ["w2-0", "winner"] }, { team: "B", from: ["x1-1", "winner"] }, gfWinner),
    match(
      "gf2",
      { team: gfWinner === "side1" ? "A" : "B", from: ["gf", "winner"] },
      { team: gfWinner === "side1" ? "B" : "A", from: ["gf", "loser"] },
      resetWinner,
    ),
  ];
}

function placements(outcomes: Map<string, TeamOutcome>): string[] {
  return [...outcomes]
    .sort(([, a], [, b]) => a.placement - b.placement)
    .map(([teamId]) => teamId);
}

function labels(outcomes: Map<string, TeamOutcome>): (string | null)[] {
  return [...outcomes.values()].map((outcome) => outcome.label);
}

describe("computeOutcomes", () => {
  it("places a no-playoff league by its standings, first as champion", () => {
    const outcomes = computeOutcomes({ standingsOrder: order, bracketMatchups: [] });

    expect(outcomes.get("A")).toEqual({
      placement: 1,
      of: 6,
      label: "Champion",
      champion: true,
    });
    expect(outcomes.get("D")).toEqual({
      placement: 4,
      of: 6,
      label: null,
      champion: false,
    });
  });

  it("titles only the champion; everyone else just has a place", () => {
    const outcomes = computeOutcomes({
      standingsOrder: order,
      bracketMatchups: fourTeamBracket("side1"),
    });

    expect(labels(outcomes).filter(Boolean)).toEqual(["Champion"]);
    expect(outcomes.get("A")).toMatchObject({ placement: 1, champion: true });
  });

  it("ranks a decided bracket ahead of the teams outside it", () => {
    const outcomes = computeOutcomes({
      standingsOrder: order,
      bracketMatchups: fourTeamBracket("side1"),
    });

    expect(placements(outcomes)).toEqual(["A", "C", "B", "D", "E", "F"]);
    expect(outcomes.get("C")).toMatchObject({ placement: 2, champion: false });
    expect(outcomes.get("F")).toMatchObject({ placement: 6, of: 6 });
  });

  it("names no champion while the final is undecided", () => {
    const outcomes = computeOutcomes({
      standingsOrder: order,
      bracketMatchups: fourTeamBracket(),
    });

    expect([...outcomes.values()].some((outcome) => outcome.champion)).toBe(false);
    expect(labels(outcomes).filter(Boolean)).toEqual([]);
    expect(placements(outcomes).slice(0, 2)).toEqual(["A", "C"]);
  });

  it("uses a third-place match to split the semifinal losers", () => {
    const outcomes = computeOutcomes({
      standingsOrder: order,
      bracketMatchups: [
        ...fourTeamBracket("side2"),
        match(
          "third",
          { team: "D", from: ["sf1", "loser"] },
          { team: "B", from: ["sf2", "loser"] },
          "side1",
        ),
      ],
    });

    expect(placements(outcomes).slice(0, 4)).toEqual(["C", "A", "D", "B"]);
  });

  it("places an eight-team bracket by the round each team went out in", () => {
    const quarters = [
      match("q1", { team: "A" }, { team: "H" }, "side1"),
      match("q2", { team: "D" }, { team: "E" }, "side1"),
      match("q3", { team: "B" }, { team: "G" }, "side1"),
      match("q4", { team: "C" }, { team: "F" }, "side2"),
    ];
    const outcomes = computeOutcomes({
      standingsOrder: ["A", "B", "C", "D", "E", "F", "G", "H"],
      bracketMatchups: [
        ...quarters,
        match("s1", { team: "A", from: ["q1", "winner"] }, { team: "D", from: ["q2", "winner"] }, "side1"),
        match("s2", { team: "B", from: ["q3", "winner"] }, { team: "F", from: ["q4", "winner"] }, "side1"),
        match("f", { team: "A", from: ["s1", "winner"] }, { team: "B", from: ["s2", "winner"] }, "side2"),
      ],
    });

    expect(placements(outcomes)).toEqual(["B", "A", "D", "F", "C", "E", "G", "H"]);
  });

  it("places a double-elimination bracket by where each team went out", () => {
    const outcomes = computeOutcomes({
      standingsOrder: ["A", "B", "C", "D"],
      bracketMatchups: doubleElimination("side2", "side1"),
    });

    expect(placements(outcomes)).toEqual(["B", "A", "C", "D"]);
    expect(outcomes.get("B")).toMatchObject({ label: "Champion", champion: true });
  });

  it("crowns the grand final winner when the reset was never needed", () => {
    const outcomes = computeOutcomes({
      standingsOrder: ["A", "B", "C", "D"],
      bracketMatchups: doubleElimination("side1"),
    });

    expect(placements(outcomes)).toEqual(["A", "B", "C", "D"]);
    expect(outcomes.get("A")).toMatchObject({ champion: true });
  });

  it("waits for the reset when the losers' side took the first grand final", () => {
    const outcomes = computeOutcomes({
      standingsOrder: ["A", "B", "C", "D"],
      bracketMatchups: doubleElimination("side2"),
    });

    expect([...outcomes.values()].some((outcome) => outcome.champion)).toBe(false);
  });
});
