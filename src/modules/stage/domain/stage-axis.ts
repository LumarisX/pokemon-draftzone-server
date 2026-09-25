import { Types } from "mongoose";

export interface RoundLike {
  _id: Types.ObjectId;
  name: string;
  matchDeadline?: Date;
  tradeDeadline?: Date;
}

export interface TradeLike {
  _id?: Types.ObjectId;
  side1: TradeSideLike;
  side2: TradeSideLike;
  timestamp: Date;
  activeRound?: number;
  activeRoundId?: Types.ObjectId;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedBy?: string;
  resolvedBy?: string;
}

interface TradeSideLike {
  team?: Types.ObjectId | { _id: Types.ObjectId };
  pokemon: { id: string; addons?: string[] }[];
  tradePoints?: number;
}

export interface AxisTournament {
  rounds?: RoundLike[];
  currentRoundIndex?: number;
  trades?: TradeLike[];
}

export function tradeRoundIndex(
  trade: Pick<TradeLike, "activeRound" | "activeRoundId">,
  rounds: RoundLike[],
): number {
  if (trade.activeRoundId) {
    const id = trade.activeRoundId.toString();
    return rounds.findIndex((round) => round._id.toString() === id);
  }
  return trade.activeRound ?? -1;
}

export interface RosterContext {
  readonly __brand: "RosterContext";
  trades: TradeLike[];
  rounds: RoundLike[];
  currentRoundIndex: number;
}

export function rosterContext(tournament: AxisTournament): RosterContext {
  return {
    __brand: "RosterContext",
    trades: tournament.trades ?? [],
    rounds: tournament.rounds ?? [],
    currentRoundIndex: tournament.currentRoundIndex ?? -1,
  };
}
