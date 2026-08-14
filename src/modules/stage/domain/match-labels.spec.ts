import { Types } from "mongoose";
import { buildMatchLabels } from "./match-labels";

const id = () => new Types.ObjectId();

describe("buildMatchLabels", () => {
  const stageA = id();
  const stageB = id();
  const round1 = id();
  const round2 = id();
  const roundIndex = new Map([
    [round1.toString(), 0],
    [round2.toString(), 1],
  ]);

  it("numbers a stage's matches by round then position", () => {
    const first = id();
    const second = id();
    const third = id();
    const labels = buildMatchLabels(
      [
        { _id: third, stage: stageA, round: round2, position: 0 },
        { _id: second, stage: stageA, round: round1, position: 1 },
        { _id: first, stage: stageA, round: round1, position: 0 },
      ],
      roundIndex,
    );

    expect(labels.get(first.toString())?.label).toBe("Match 1");
    expect(labels.get(second.toString())?.label).toBe("Match 2");
    expect(labels.get(third.toString())?.label).toBe("Match 3");
  });

  it("numbers each stage from one", () => {
    const a = id();
    const b = id();
    const labels = buildMatchLabels(
      [
        { _id: a, stage: stageA, round: round1, position: 0 },
        { _id: b, stage: stageB, round: round1, position: 0 },
      ],
      roundIndex,
    );

    expect(labels.get(a.toString())?.label).toBe("Match 1");
    expect(labels.get(b.toString())?.label).toBe("Match 1");
  });

  it("keeps an explicit label without spending a number on it", () => {
    const named = id();
    const plain = id();
    const labels = buildMatchLabels(
      [
        { _id: named, stage: stageA, round: round1, position: 0, label: "Finals" },
        { _id: plain, stage: stageA, round: round1, position: 1 },
      ],
      roundIndex,
    );

    expect(labels.get(named.toString())?.label).toBe("Finals");
    expect(labels.get(plain.toString())?.label).toBe("Match 1");
  });

  it("carries each match's slug, or null when it has none", () => {
    const withSlug = id();
    const without = id();
    const labels = buildMatchLabels(
      [
        { _id: withSlug, stage: stageA, round: round1, position: 0, slug: "qf-1" },
        { _id: without, stage: stageA, round: round1, position: 1 },
      ],
      roundIndex,
    );

    expect(labels.get(withSlug.toString())?.slug).toBe("qf-1");
    expect(labels.get(without.toString())?.slug).toBeNull();
  });
});
