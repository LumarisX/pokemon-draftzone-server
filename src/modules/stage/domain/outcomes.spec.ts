import { AdvancementMatchup } from "./advancement";
import { computeOutcomes } from "./outcomes";

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

  it("ranks a decided bracket ahead of the teams that missed it", () => {
    const outcomes = computeOutcomes({
      standingsOrder: order,
      bracketMatchups: fourTeamBracket("side1"),
    });

    expect(outcomes.get("A")).toMatchObject({ placement: 1, label: "Champion", champion: true });
    expect(outcomes.get("C")).toMatchObject({ placement: 2, label: "Runner-Up", champion: false });
    expect(outcomes.get("B")).toMatchObject({ placement: 3, label: "Semifinalist" });
    expect(outcomes.get("D")).toMatchObject({ placement: 4, label: "Semifinalist" });
    expect(outcomes.get("E")).toMatchObject({ placement: 5, label: "Missed Playoffs" });
    expect(outcomes.get("F")).toMatchObject({ placement: 6, of: 6 });
  });

  it("names no champion while the final is undecided", () => {
    const outcomes = computeOutcomes({
      standingsOrder: order,
      bracketMatchups: fourTeamBracket(),
    });

    expect([...outcomes.values()].some((outcome) => outcome.champion)).toBe(false);
    expect(outcomes.get("A")).toMatchObject({ placement: 1, label: "Finalist" });
    expect(outcomes.get("C")).toMatchObject({ placement: 2, label: "Finalist" });
    expect(outcomes.get("B")).toMatchObject({ placement: 3, label: "Semifinalist" });
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

    expect(outcomes.get("C")).toMatchObject({ placement: 1, champion: true });
    expect(outcomes.get("A")).toMatchObject({ placement: 2, label: "Runner-Up" });
    expect(outcomes.get("D")).toMatchObject({ placement: 3, label: "Third Place" });
    expect(outcomes.get("B")).toMatchObject({ placement: 4, label: "Semifinalist" });
  });

  it("labels an eight-team bracket's first-round losers as quarterfinalists", () => {
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

    expect(outcomes.get("B")).toMatchObject({ placement: 1, champion: true });
    expect(outcomes.get("A")).toMatchObject({ placement: 2 });
    expect(outcomes.get("D")).toMatchObject({ label: "Semifinalist" });
    expect(outcomes.get("C")).toMatchObject({ label: "Quarterfinalist" });
    expect(outcomes.get("H")).toMatchObject({ placement: 8, label: "Quarterfinalist" });
  });
});
