import {
  TournamentBracketMatchInput,
  TournamentBracketStageInput,
  validateTournamentBracket,
} from "./tournament-bracket";

const stage = (
  key: string,
  teamCount: number,
  type = "single-elimination",
): TournamentBracketStageInput => ({ key, type, teamCount });

const seedMatch = (
  key: string,
  stageKey: string,
  roundIndex: number,
  a: number,
  b: number,
): TournamentBracketMatchInput => ({
  key,
  stageKey,
  roundIndex,
  a: { type: "seed", seed: a },
  b: { type: "seed", seed: b },
});

describe("validateTournamentBracket", () => {
  it("accepts a two-stage tournament on one round axis", () => {
    const errors = validateTournamentBracket(
      [stage("groups", 4, "round-robin"), stage("finals", 2)],
      [
        seedMatch("g1", "groups", 0, 1, 2),
        seedMatch("g2", "groups", 0, 3, 4),
        seedMatch("g3", "groups", 1, 1, 3),
        seedMatch("g4", "groups", 1, 2, 4),
        seedMatch("f1", "finals", 2, 1, 2),
      ],
      3,
    );

    expect(errors).toEqual([]);
  });

  describe("seeds are numbered within a stage", () => {
    it("lets two stages each use seed 1", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2), stage("b", 2)],
        [seedMatch("a1", "a", 0, 1, 2), seedMatch("b1", "b", 1, 1, 2)],
        2,
      );

      expect(errors).toEqual([]);
    });

    it("bounds a seed by its own stage's team count, not the tournament's", () => {
      const errors = validateTournamentBracket(
        [stage("big", 8), stage("small", 2)],
        [
          seedMatch("s1", "small", 0, 1, 5),
          seedMatch("b1", "big", 0, 1, 2),
          seedMatch("b2", "big", 0, 3, 4),
          seedMatch("b3", "big", 0, 5, 6),
          seedMatch("b4", "big", 0, 7, 8),
        ],
        1,
      );

      expect(errors).toContain(
        'Match "s1" uses seed 5 of stage "small", expected 1..2',
      );
    });

    it("reports a seed that never plays, per stage", () => {
      const errors = validateTournamentBracket(
        [stage("a", 4)],
        [seedMatch("a1", "a", 0, 1, 2)],
        1,
      );

      expect(errors).toEqual([
        'Seed 3 of stage "a" never plays',
        'Seed 4 of stage "a" never plays',
      ]);
    });
  });

  describe("stages fed entirely by reference", () => {
    it("does not demand seeds from a losers bracket", () => {
      // Its teams arrive by losing elsewhere, so it has a roster but no seed
      // slots. Requiring every seed to appear would fail every such stage.
      const errors = validateTournamentBracket(
        [stage("winners", 4), stage("losers", 4)],
        [
          seedMatch("w1", "winners", 0, 1, 2),
          seedMatch("w2", "winners", 0, 3, 4),
          {
            key: "l1",
            stageKey: "losers",
            roundIndex: 1,
            a: { type: "loser", from: "w1" },
            b: { type: "loser", from: "w2" },
          },
        ],
        2,
      );

      expect(errors).toEqual([]);
    });

    it("still reports a partial seeding", () => {
      const errors = validateTournamentBracket(
        [stage("a", 4)],
        [
          seedMatch("a1", "a", 0, 1, 2),
          {
            key: "a2",
            stageKey: "a",
            roundIndex: 1,
            a: { type: "winner", from: "a1" },
            b: { type: "seed", seed: 3 },
          },
        ],
        2,
      );

      expect(errors).toEqual(['Seed 4 of stage "a" never plays']);
    });
  });

  describe("cross-stage references", () => {
    it("accepts a playoff slot fed by a group stage match", () => {
      const errors = validateTournamentBracket(
        [stage("groups", 2, "round-robin"), stage("playoffs", 2)],
        [
          seedMatch("g1", "groups", 0, 1, 2),
          {
            key: "p1",
            stageKey: "playoffs",
            roundIndex: 1,
            a: { type: "winner", from: "g1" },
            b: { type: "seed", seed: 1 },
          },
          {
            key: "p2",
            stageKey: "playoffs",
            roundIndex: 1,
            a: { type: "loser", from: "g1" },
            b: { type: "seed", seed: 2 },
          },
        ],
        2,
      );

      expect(errors).toEqual([]);
    });

    it("rejects a reference to a match that does not exist anywhere", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2)],
        [
          seedMatch("a1", "a", 0, 1, 2),
          {
            key: "a2",
            stageKey: "a",
            roundIndex: 1,
            a: { type: "winner", from: "ghost" },
            b: { type: "winner", from: "a1" },
          },
        ],
        2,
      );

      expect(errors).toContain('Match "a2" references missing match "ghost"');
    });

    it("rejects consuming the same outcome twice, across stages", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2), stage("b", 2)],
        [
          seedMatch("a1", "a", 0, 1, 2),
          seedMatch("b1", "b", 0, 1, 2),
          {
            key: "x",
            stageKey: "b",
            roundIndex: 1,
            a: { type: "winner", from: "a1" },
            b: { type: "winner", from: "b1" },
          },
          {
            key: "y",
            stageKey: "b",
            roundIndex: 1,
            a: { type: "winner", from: "a1" },
            b: { type: "loser", from: "b1" },
          },
        ],
        2,
      );

      expect(errors).toContain('winner of "a1" is used more than once');
    });
  });

  describe("seed reuse depends on the stage type", () => {
    it("lets a round-robin stage replay its teams every round", () => {
      const errors = validateTournamentBracket(
        [stage("rr", 2, "round-robin")],
        [seedMatch("r1", "rr", 0, 1, 2), seedMatch("r2", "rr", 1, 1, 2)],
        2,
      );

      expect(errors).toEqual([]);
    });

    it("lets a swiss stage replay them too", () => {
      const errors = validateTournamentBracket(
        [stage("sw", 2, "swiss")],
        [seedMatch("s1", "sw", 0, 1, 2), seedMatch("s2", "sw", 1, 1, 2)],
        2,
      );

      expect(errors).toEqual([]);
    });

    it("rejects a knockout stage entering the same seed twice", () => {
      const errors = validateTournamentBracket(
        [stage("ko", 2)],
        [seedMatch("k1", "ko", 0, 1, 2), seedMatch("k2", "ko", 1, 1, 2)],
        2,
      );

      expect(errors).toContain('Seed 1 enters stage "ko" more than once');
    });
  });

  describe("basic structure", () => {
    it("rejects a match on an unknown stage", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2)],
        [seedMatch("x", "nope", 0, 1, 2), seedMatch("a1", "a", 0, 1, 2)],
        1,
      );

      expect(errors).toContain(
        'Match "x" belongs to unknown stage "nope"',
      );
    });

    it("rejects a round index outside the tournament's rounds", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2)],
        [seedMatch("a1", "a", 3, 1, 2)],
        2,
      );

      expect(errors).toContain(
        'Match "a1" has round index 3, expected 0..1',
      );
    });

    it("rejects duplicate match keys", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2)],
        [seedMatch("dup", "a", 0, 1, 2), seedMatch("dup", "a", 1, 1, 2)],
        2,
      );

      expect(errors).toContain('Duplicate match key "dup"');
    });

    it("rejects duplicate stage keys", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2), stage("a", 4)],
        [seedMatch("a1", "a", 0, 1, 2)],
        1,
      );

      expect(errors).toContain('Duplicate stage key "a"');
    });

    it("rejects a self-reference", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2)],
        [
          seedMatch("a1", "a", 0, 1, 2),
          {
            key: "a2",
            stageKey: "a",
            roundIndex: 1,
            a: { type: "winner", from: "a2" },
            b: { type: "winner", from: "a1" },
          },
        ],
        2,
      );

      expect(errors).toContain('Match "a2" references itself');
    });

    it("detects a cycle spanning two stages", () => {
      const errors = validateTournamentBracket(
        [stage("a", 2), stage("b", 2)],
        [
          {
            key: "x",
            stageKey: "a",
            roundIndex: 0,
            a: { type: "winner", from: "y" },
            b: { type: "seed", seed: 1 },
          },
          {
            key: "y",
            stageKey: "b",
            roundIndex: 1,
            a: { type: "winner", from: "x" },
            b: { type: "seed", seed: 1 },
          },
        ],
        2,
      );

      expect(errors.some((e) => e.startsWith("Cycle detected"))).toBe(true);
    });
  });
});
