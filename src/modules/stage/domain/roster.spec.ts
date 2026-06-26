import { PopulatedTeam } from "@modules/team/team.repository";
import { StageDocument, StageTradeEntity } from "@modules/stage/stage.schema";
import { Types } from "mongoose";
import {
  getRosterByRound,
  getRostersBeforeRound,
  updateRosterWithTrades,
} from "./roster";

function buildTeam(pickLog: { pokemon: { id: string }; addons?: string[] }[]) {
  return {
    _id: new Types.ObjectId(),
    pickLog,
  } as unknown as PopulatedTeam;
}

function buildTrade(overrides: Partial<StageTradeEntity> = {}): StageTradeEntity {
  return {
    side1: { team: undefined, pokemon: [] },
    side2: { team: undefined, pokemon: [] },
    timestamp: new Date(),
    activeRound: 0,
    status: "APPROVED",
    ...overrides,
  } as StageTradeEntity;
}

function buildStage(overrides: Partial<StageDocument> = {}): StageDocument {
  return {
    rounds: [{}, {}, {}],
    trades: [],
    currentRoundIndex: 0,
    ...overrides,
  } as unknown as StageDocument;
}

describe("updateRosterWithTrades", () => {
  it("leaves the roster untouched when no trade involves the team", () => {
    const teamId = new Types.ObjectId();
    const otherTeamId = new Types.ObjectId();
    const roster = [{ id: "pikachu" }];
    const trade = buildTrade({
      side1: { team: otherTeamId, pokemon: [{ id: "mew" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });

    const result = updateRosterWithTrades(teamId, roster, [trade]);

    expect(result).toEqual(roster);
  });

  it("swaps out what the team (as side1) sent for what it received", () => {
    const teamId = new Types.ObjectId();
    const trade = buildTrade({
      side1: { team: teamId, pokemon: [{ id: "pikachu" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });
    const roster = [{ id: "pikachu" }, { id: "charizard" }];

    const result = updateRosterWithTrades(teamId, roster, [trade]);

    expect(result).toEqual([{ id: "charizard" }, { id: "mewtwo" }]);
  });

  it("swaps out what the team (as side2) sent for what it received", () => {
    const teamId = new Types.ObjectId();
    const trade = buildTrade({
      side1: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
      side2: { team: teamId, pokemon: [{ id: "pikachu" }] },
    });
    const roster = [{ id: "pikachu" }, { id: "charizard" }];

    const result = updateRosterWithTrades(teamId, roster, [trade]);

    expect(result).toEqual([{ id: "charizard" }, { id: "mewtwo" }]);
  });

  it("resolves the team reference whether it's a raw ObjectId or a populated {_id} document", () => {
    const teamId = new Types.ObjectId();
    const trade = buildTrade({
      side1: { team: { _id: teamId } as any, pokemon: [{ id: "pikachu" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });

    const result = updateRosterWithTrades(teamId, [{ id: "pikachu" }], [trade]);

    expect(result).toEqual([{ id: "mewtwo" }]);
  });

  it("applies multiple trades in the same batch sequentially", () => {
    const teamId = new Types.ObjectId();
    const firstTrade = buildTrade({
      side1: { team: teamId, pokemon: [{ id: "pikachu" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });
    const secondTrade = buildTrade({
      side1: { team: teamId, pokemon: [{ id: "mewtwo" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "rayquaza" }] },
    });
    const roster = [{ id: "pikachu" }];

    const result = updateRosterWithTrades(teamId, roster, [firstTrade, secondTrade]);

    expect(result).toEqual([{ id: "rayquaza" }]);
  });

  it("carries over addons on the received Pokemon", () => {
    const teamId = new Types.ObjectId();
    const trade = buildTrade({
      side1: { team: teamId, pokemon: [{ id: "pikachu" }] },
      side2: {
        team: new Types.ObjectId(),
        pokemon: [{ id: "charizard", addons: ["Tera Captain"] }],
      },
    });

    const result = updateRosterWithTrades(teamId, [{ id: "pikachu" }], [trade]);

    expect(result).toEqual([{ id: "charizard", addons: ["Tera Captain"] }]);
  });
});

describe("getRosterByRound", () => {
  it("returns the raw pick log, unmodified, when there's no stage", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" }, addons: ["Tera Captain"] }]);

    const result = getRosterByRound(team, undefined);

    expect(result).toEqual([{ id: "pikachu", addons: ["Tera Captain"] }]);
  });

  it("applies only APPROVED trades, ignoring PENDING/REJECTED ones", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" } }]);
    const pendingTrade = buildTrade({
      status: "PENDING",
      activeRound: 0,
      side1: { team: team._id, pokemon: [{ id: "pikachu" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });
    const stage = buildStage({ trades: [pendingTrade], currentRoundIndex: 1 });

    const result = getRosterByRound(team, stage);

    expect(result).toEqual([{ id: "pikachu" }]);
  });

  it("applies a round's trade once the walk reaches that round", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" } }]);
    const trade = buildTrade({
      activeRound: 1,
      side1: { team: team._id, pokemon: [{ id: "pikachu" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });
    const stage = buildStage({ trades: [trade] });

    expect(getRosterByRound(team, stage, 0)).toEqual([{ id: "pikachu" }]);
    expect(getRosterByRound(team, stage, 1)).toEqual([{ id: "mewtwo" }]);
  });

  it("defaults roundIndex to the stage's currentRoundIndex", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" } }]);
    const trade = buildTrade({
      activeRound: 2,
      side1: { team: team._id, pokemon: [{ id: "pikachu" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });
    const stage = buildStage({ trades: [trade], currentRoundIndex: 2 });

    expect(getRosterByRound(team, stage)).toEqual([{ id: "mewtwo" }]);
  });

  it("ignores trades that don't involve this team", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" } }]);
    const trade = buildTrade({
      activeRound: 0,
      side1: { team: new Types.ObjectId(), pokemon: [{ id: "mew" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });
    const stage = buildStage({ trades: [trade], currentRoundIndex: 1 });

    expect(getRosterByRound(team, stage)).toEqual([{ id: "pikachu" }]);
  });
});

describe("getRostersBeforeRound", () => {
  it("returns just the raw pick log wrapped in a single-element array when there's no stage", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" } }]);

    const result = getRostersBeforeRound(team, undefined);

    expect(result).toEqual([[{ id: "pikachu" }]]);
  });

  it("returns a snapshot for every round from 0 through roundIndex inclusive", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" } }]);
    const trade = buildTrade({
      activeRound: 1,
      side1: { team: team._id, pokemon: [{ id: "pikachu" }] },
      side2: { team: new Types.ObjectId(), pokemon: [{ id: "mewtwo" }] },
    });
    const stage = buildStage({ trades: [trade] });

    const result = getRostersBeforeRound(team, stage, 2);

    expect(result).toEqual([
      [{ id: "pikachu" }], // start of round 0: raw pick log
      [{ id: "pikachu" }], // start of round 1: round 0 had no trade for this team
      [{ id: "mewtwo" }], // start of round 2: round 1's trade has now applied
    ]);
  });

  it("defaults to walking every round in the stage when roundIndex is omitted", () => {
    const team = buildTeam([{ pokemon: { id: "pikachu" } }]);
    const stage = buildStage({ rounds: [{}, {}] as any, trades: [] });

    const result = getRostersBeforeRound(team, stage);

    // 1 initial snapshot + 1 per round (2 rounds) = 3 total.
    expect(result).toHaveLength(3);
  });
});
