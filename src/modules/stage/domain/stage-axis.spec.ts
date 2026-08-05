import { Types } from "mongoose";
import { StageDocument } from "../stage.schema";
import {
  currentRoundIndex,
  rosterContext,
  rosterContextForTournament,
  stageRounds,
  stageTeamIds,
  stageTrades,
  usesTournamentAxis,
} from "./stage-axis";

const round = (name: string) => ({ _id: new Types.ObjectId(), name });

const trade = (activeRound: number) => ({
  _id: new Types.ObjectId(),
  side1: { team: new Types.ObjectId(), pokemon: [] },
  side2: { team: new Types.ObjectId(), pokemon: [] },
  timestamp: new Date(),
  activeRound,
  status: "APPROVED" as const,
});

/** A stage as it exists before the sections-to-stages migration. */
function legacyStage(overrides: Record<string, unknown> = {}) {
  return {
    rounds: [round("Week 1"), round("Week 2")],
    pools: [
      { poolKey: "a", name: "A", teamIds: [new Types.ObjectId()] },
      { poolKey: "b", name: "B", teamIds: [new Types.ObjectId()] },
    ],
    teamIds: [],
    trades: [trade(0)],
    currentRoundIndex: 1,
    ...overrides,
  } as unknown as StageDocument;
}

/** A stage as the migration creates it: teams only, no schedule of its own. */
function migratedStage(overrides: Record<string, unknown> = {}) {
  return {
    rounds: [],
    pools: [],
    teamIds: [new Types.ObjectId(), new Types.ObjectId()],
    trades: [],
    currentRoundIndex: -1,
    ...overrides,
  } as unknown as StageDocument;
}

describe("stageRounds", () => {
  it("uses the stage's own rounds when the tournament has none", () => {
    const stage = legacyStage();

    expect(stageRounds(stage, { rounds: [] })).toBe(stage.rounds);
  });

  it("uses the tournament's rounds once it has them", () => {
    const rounds = [round("Week 1"), round("Week 2"), round("Playoffs")];

    expect(stageRounds(migratedStage(), { rounds })).toBe(rounds);
  });

  it("prefers the tournament's rounds over a stage's leftover copy", () => {
    // A single-section stage keeps its `_id` through the migration, so it also
    // keeps its old rounds. Reading those would point matchups at subdocuments
    // no longer on the axis.
    const rounds = [round("Week 1")];

    expect(stageRounds(legacyStage(), { rounds })).toBe(rounds);
  });

  it("returns an empty list for a stage with no bracket built yet", () => {
    expect(stageRounds(migratedStage(), { rounds: [] })).toEqual([]);
  });
});

describe("currentRoundIndex", () => {
  it("reads the stage's index before the migration", () => {
    expect(currentRoundIndex(legacyStage(), { rounds: [] })).toBe(1);
  });

  it("reads the tournament's index after it", () => {
    expect(
      currentRoundIndex(legacyStage(), {
        rounds: [round("Week 1")],
        currentRoundIndex: 0,
      }),
    ).toBe(0);
  });

  it("defaults to -1 when the tournament owns the axis but has not started", () => {
    expect(
      currentRoundIndex(migratedStage(), { rounds: [round("Week 1")] }),
    ).toBe(-1);
  });
});

describe("stageTeamIds", () => {
  it("flattens pools in order for a pre-migration stage", () => {
    const stage = legacyStage();

    expect(stageTeamIds(stage)).toEqual([
      stage.pools[0].teamIds[0],
      stage.pools[1].teamIds[0],
    ]);
  });

  it("reads teamIds for a migrated stage", () => {
    const stage = migratedStage();

    expect(stageTeamIds(stage)).toBe(stage.teamIds);
  });

  it("prefers teamIds over pools when a stage carries both", () => {
    // Seeds are numbered positionally, so reading the wrong list would
    // renumber every seed in the bracket.
    const stage = legacyStage({ teamIds: [new Types.ObjectId()] });

    expect(stageTeamIds(stage)).toBe(stage.teamIds);
  });

  it("returns an empty list rather than throwing when there are no teams", () => {
    expect(stageTeamIds(migratedStage({ teamIds: [] }))).toEqual([]);
  });
});

describe("stageTrades", () => {
  it("reads the stage's trades before the migration", () => {
    const stage = legacyStage();

    expect(stageTrades(stage, { rounds: [] })).toBe(stage.trades);
  });

  it("reads the tournament's trades after it, ignoring the stage's copy", () => {
    // The migration leaves the stage's trades in place for rollback. Counting
    // both would double every roster change.
    const trades = [trade(0), trade(2)];

    expect(
      stageTrades(legacyStage(), { rounds: [round("Week 1")], trades }),
    ).toBe(trades);
  });

  it("returns no trades for a migrated tournament that has none", () => {
    expect(stageTrades(migratedStage(), { rounds: [round("Week 1")] })).toEqual(
      [],
    );
  });
});

describe("usesTournamentAxis", () => {
  it.each([
    ["no tournament", undefined, false],
    ["a tournament with no rounds", { rounds: [] }, false],
    ["a tournament with rounds", { rounds: [round("Week 1")] }, true],
  ])("is %s -> %s", (_label, tournament, expected) => {
    expect(usesTournamentAxis(tournament)).toBe(expected);
  });
});

describe("rosterContext", () => {
  it("resolves all three axis fields from the same source", () => {
    const rounds = [round("Week 1"), round("Week 2")];
    const trades = [trade(1)];

    const context = rosterContext(legacyStage(), {
      rounds,
      currentRoundIndex: 1,
      trades,
    });

    expect(context.rounds).toBe(rounds);
    expect(context.trades).toBe(trades);
    expect(context.currentRoundIndex).toBe(1);
  });

  it("falls back to the stage wholesale when the tournament has no axis", () => {
    const stage = legacyStage();

    const context = rosterContext(stage, { rounds: [] });

    expect(context.rounds).toBe(stage.rounds);
    expect(context.trades).toBe(stage.trades);
    expect(context.currentRoundIndex).toBe(1);
  });
});

describe("rosterContextForTournament", () => {
  it("reads the tournament's own axis when it has one, with no stage at all", () => {
    // The case every roster listing used to get wrong: it passed undefined
    // whenever it had not resolved a stage, silently dropping every trade.
    const trades = [trade(0)];

    const context = rosterContextForTournament({
      rounds: [round("Week 1")],
      currentRoundIndex: 0,
      trades,
      stages: [],
    });

    expect(context?.trades).toBe(trades);
  });

  it("ignores a passed stage's legacy trades once the tournament is migrated", () => {
    const trades = [trade(0)];

    const context = rosterContextForTournament(
      { rounds: [round("Week 1")], trades, stages: [] },
      legacyStage(),
    );

    expect(context?.trades).toBe(trades);
  });

  it("reads the caller's stage on the legacy path", () => {
    const stage = legacyStage();

    const context = rosterContextForTournament({ rounds: [] }, stage);

    expect(context?.trades).toBe(stage.trades);
  });

  it("resolves a pre-migration tournament's only stage without being told", () => {
    const stage = legacyStage();

    const context = rosterContextForTournament({
      rounds: [],
      stages: [stage],
    });

    expect(context?.trades).toBe(stage.trades);
  });

  it("returns no context when a pre-migration tournament has several stages", () => {
    // Each carries its own rounds, so there is no single axis to replay
    // against — the caller has to name the stage it means.
    expect(
      rosterContextForTournament({
        rounds: [],
        stages: [legacyStage(), legacyStage()],
      }),
    ).toBeUndefined();
  });

  it("returns no context for a pre-migration tournament with no stages", () => {
    expect(
      rosterContextForTournament({ rounds: [], stages: [] }),
    ).toBeUndefined();
  });
});
