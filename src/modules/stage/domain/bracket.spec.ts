import {
  BracketMatchInput,
  CERTIFIED_SHUFFLE_ALGORITHM,
  certifiedRandomSeedOrder,
  validateBracketStructure,
} from "./bracket";

const seed = (n: number) => ({ type: "seed", seed: n }) as const;
const winnerOf = (from: string) => ({ type: "winner", from }) as const;
const loserOf = (from: string) => ({ type: "loser", from }) as const;

/** 3-team double elim: 2v3 opener, final vs seed 1, one losers match. */
const threeTeamDoubleElim: BracketMatchInput[] = [
  { key: "w1-1", roundIndex: 0, a: seed(2), b: seed(3) },
  { key: "w2-0", roundIndex: 1, a: seed(1), b: winnerOf("w1-1") },
  { key: "l2-0", roundIndex: 2, a: loserOf("w1-1"), b: loserOf("w2-0") },
  { key: "gf", roundIndex: 3, a: winnerOf("w2-0"), b: winnerOf("l2-0") },
];

describe("validateBracketStructure", () => {
  it("accepts a well-formed bracket", () => {
    expect(validateBracketStructure(threeTeamDoubleElim, 3, 4)).toEqual([]);
  });

  it("rejects an empty bracket", () => {
    expect(validateBracketStructure([], 2, 1)).toEqual([
      "Bracket has no matches",
    ]);
  });

  it("flags duplicate keys, bad rounds, and bad seeds", () => {
    const errors = validateBracketStructure(
      [
        { key: "m", roundIndex: 0, a: seed(1), b: seed(2) },
        { key: "m", roundIndex: 5, a: seed(0), b: seed(9) },
      ],
      2,
      1,
    );
    expect(errors.some((e) => e.includes('Duplicate match key "m"'))).toBe(
      true,
    );
    expect(errors.some((e) => e.includes("round index 5"))).toBe(true);
    expect(errors.some((e) => e.includes("uses seed 0"))).toBe(true);
    expect(errors.some((e) => e.includes("uses seed 9"))).toBe(true);
  });

  it("flags seeds that repeat or never enter", () => {
    const errors = validateBracketStructure(
      [{ key: "m", roundIndex: 0, a: seed(1), b: seed(1) }],
      2,
      1,
    );
    expect(
      errors.some((e) => e.includes("Seed 1 enters the bracket more than once")),
    ).toBe(true);
    expect(errors.some((e) => e.includes("Seed 2 never enters"))).toBe(true);
  });

  it("flags dangling, self, and doubly-consumed references", () => {
    const errors = validateBracketStructure(
      [
        { key: "m1", roundIndex: 0, a: seed(1), b: seed(2) },
        { key: "m2", roundIndex: 1, a: winnerOf("m1"), b: winnerOf("ghost") },
        { key: "m3", roundIndex: 1, a: winnerOf("m1"), b: winnerOf("m3") },
      ],
      2,
      2,
    );
    expect(errors.some((e) => e.includes('missing match "ghost"'))).toBe(true);
    expect(errors.some((e) => e.includes('"m3" references itself'))).toBe(
      true,
    );
    expect(
      errors.some((e) => e.includes('winner of "m1" is used more than once')),
    ).toBe(true);
  });

  it("flags cycles", () => {
    const errors = validateBracketStructure(
      [
        { key: "a", roundIndex: 0, a: winnerOf("b"), b: seed(1) },
        { key: "b", roundIndex: 0, a: winnerOf("a"), b: seed(2) },
      ],
      2,
      1,
    );
    expect(errors.some((e) => e.includes("Cycle detected"))).toBe(true);
  });
});

describe("certifiedRandomSeedOrder", () => {
  const teamIds = ["team-c", "team-a", "team-e", "team-b", "team-d"];

  it("returns a permutation of the input", () => {
    const { seedOrder } = certifiedRandomSeedOrder(teamIds);
    expect([...seedOrder].sort()).toEqual([...teamIds].sort());
  });

  it("hashes the canonicalized input so submission order cannot matter", () => {
    const a = certifiedRandomSeedOrder(teamIds);
    const b = certifiedRandomSeedOrder([...teamIds].reverse());
    expect(a.inputTeamsHash).toBe(b.inputTeamsHash);
    expect(a.inputTeamsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.algorithmVersion).toBe(CERTIFIED_SHUFFLE_ALGORITHM);
  });

  it("actually randomizes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(certifiedRandomSeedOrder(teamIds).seedOrder.join(","));
    }
    // 5! = 120 orders; 100 draws landing on one order is ~impossible.
    expect(seen.size).toBeGreaterThan(1);
  });
});
