import { Types } from "mongoose";
import { rosterContext, tradeRoundIndex } from "./stage-axis";

const round = (name: string) => ({ _id: new Types.ObjectId(), name });

const trade = (activeRound: number) => ({
  _id: new Types.ObjectId(),
  side1: { team: new Types.ObjectId(), pokemon: [] },
  side2: { team: new Types.ObjectId(), pokemon: [] },
  timestamp: new Date(),
  activeRound,
  status: "APPROVED" as const,
});

describe("tradeRoundIndex", () => {
  const rounds = [round("Week 1"), round("Week 2"), round("Week 3")];

  it("resolves a pinned round id to its current position", () => {
    expect(
      tradeRoundIndex({ activeRoundId: rounds[2]._id, activeRound: 0 }, rounds),
    ).toBe(2);
  });

  it("follows the round when another is inserted ahead of it", () => {
    const pinned = { activeRoundId: rounds[1]._id };
    const reordered = [round("Bye"), ...rounds];
    expect(tradeRoundIndex(pinned, rounds)).toBe(1);
    expect(tradeRoundIndex(pinned, reordered)).toBe(2);
  });

  it("returns -1 for a round id no longer on the axis", () => {
    expect(
      tradeRoundIndex({ activeRoundId: new Types.ObjectId() }, rounds),
    ).toBe(-1);
  });

  it("falls back to the stored index on a trade that predates round ids", () => {
    expect(tradeRoundIndex({ activeRound: 1 }, rounds)).toBe(1);
    expect(tradeRoundIndex({}, rounds)).toBe(-1);
  });
});

describe("rosterContext", () => {
  it("reads rounds, trades and the current round from the tournament", () => {
    const rounds = [round("Week 1"), round("Week 2")];
    const trades = [trade(1)];

    const context = rosterContext({ rounds, currentRoundIndex: 1, trades });

    expect(context.rounds).toBe(rounds);
    expect(context.trades).toBe(trades);
    expect(context.currentRoundIndex).toBe(1);
  });

  it("defaults to an empty axis before a bracket is built", () => {
    const context = rosterContext({});

    expect(context.rounds).toEqual([]);
    expect(context.trades).toEqual([]);
    expect(context.currentRoundIndex).toBe(-1);
  });
});
