import { Types } from "mongoose";
import { StageDocument } from "../stage.schema";

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

export type AxisStage = Pick<
  StageDocument,
  "rounds" | "trades" | "currentRoundIndex" | "teamIds" | "pools"
>;

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

export function stageRounds(
  stage: Pick<StageDocument, "rounds">,
  tournament?: AxisTournament,
): RoundLike[] {
  if (tournament?.rounds?.length) return tournament.rounds;
  return stage.rounds ?? [];
}

export function currentRoundIndex(
  stage: Pick<StageDocument, "rounds" | "currentRoundIndex">,
  tournament?: AxisTournament,
): number {
  if (tournament?.rounds?.length) return tournament.currentRoundIndex ?? -1;
  return stage.currentRoundIndex ?? -1;
}

export function stageTeamIds(
  stage: Pick<StageDocument, "teamIds" | "pools">,
): Types.ObjectId[] {
  if (stage.teamIds?.length) return stage.teamIds;
  return (stage.pools ?? []).flatMap((pool) => pool.teamIds);
}

export function usesTournamentAxis(tournament?: AxisTournament): boolean {
  return Boolean(tournament?.rounds?.length);
}

export function stageTrades(
  stage: Pick<StageDocument, "trades">,
  tournament?: AxisTournament,
): TradeLike[] {
  if (usesTournamentAxis(tournament)) return tournament!.trades ?? [];
  return stage.trades ?? [];
}

export interface RosterContext {
  readonly __brand: "RosterContext";
  trades: TradeLike[];
  rounds: RoundLike[];
  currentRoundIndex: number;
}

export function rosterContext(
  stage: AxisStage,
  tournament?: AxisTournament,
): RosterContext {
  return {
    __brand: "RosterContext",
    trades: stageTrades(stage, tournament),
    rounds: stageRounds(stage, tournament),
    currentRoundIndex: currentRoundIndex(stage, tournament),
  };
}

export function tournamentRosterContext(
  tournament: AxisTournament,
): RosterContext {
  return {
    __brand: "RosterContext",
    trades: tournament.trades ?? [],
    rounds: tournament.rounds ?? [],
    currentRoundIndex: tournament.currentRoundIndex ?? -1,
  };
}

export function rosterContextForTournament(
  tournament: AxisTournament & { stages?: AxisStage[] },
  stage?: AxisStage,
): RosterContext | undefined {
  if (usesTournamentAxis(tournament))
    return tournamentRosterContext(tournament);
  const legacyStage =
    stage ??
    (tournament.stages?.length === 1 ? tournament.stages[0] : undefined);
  return legacyStage ? rosterContext(legacyStage, tournament) : undefined;
}
