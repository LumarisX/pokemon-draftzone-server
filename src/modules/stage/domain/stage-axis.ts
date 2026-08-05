import { Types } from "mongoose";
import { StageDocument } from "../stage.schema";

/**
 * Where a stage's rounds and teams come from while both data shapes exist.
 *
 * Rounds moved to the tournament and pools collapsed into `stage.teamIds`, but
 * that is only true of a tournament the sections-to-stages migration has run
 * over. Before it, a stage carries its own rounds and pools; after it, a stage
 * created by the split carries neither. Reads therefore cannot reach for one
 * shape or the other — they ask here, and get whichever is populated.
 *
 * These helpers are deliberately total: they return an empty list rather than
 * throwing, because a stage with no rounds yet is a normal state (a bracket
 * that has not been built), not an error.
 */

/** The fields both `StageRoundEntity` and `TournamentRoundEntity` share. */
export interface RoundLike {
  _id: Types.ObjectId;
  name: string;
  matchDeadline?: Date;
  tradeDeadline?: Date;
  bestOf?: number;
}

/** The fields both `StageTradeEntity` and `TournamentTradeEntity` share. */
export interface TradeLike {
  _id?: Types.ObjectId;
  side1: TradeSideLike;
  side2: TradeSideLike;
  timestamp: Date;
  activeRound: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface TradeSideLike {
  team?: Types.ObjectId | { _id: Types.ObjectId };
  pokemon: { id: string; addons?: string[] }[];
  tradePoints?: number;
}

/** Only the parts of a tournament the axis depends on. */
export interface AxisTournament {
  rounds?: RoundLike[];
  currentRoundIndex?: number;
  trades?: TradeLike[];
}

/** The stage fields a roster walk reads, on either axis. */
export type AxisStage = Pick<
  StageDocument,
  "rounds" | "trades" | "currentRoundIndex" | "teamIds" | "pools"
>;

/**
 * The ordered rounds a stage is laid out against.
 *
 * The tournament wins when it has any, because a migrated stage's own `rounds`
 * is empty and a pre-migration tournament's is. They are never both populated:
 * the migration fills one as it empties the other's role.
 */
export function stageRounds(
  stage: Pick<StageDocument, "rounds">,
  tournament?: AxisTournament,
): RoundLike[] {
  if (tournament?.rounds?.length) return tournament.rounds;
  return stage.rounds ?? [];
}

/**
 * Which round is currently live, as an index into {@link stageRounds}.
 *
 * -1 means "not started", which is the default on both shapes.
 */
export function currentRoundIndex(
  stage: Pick<StageDocument, "rounds" | "currentRoundIndex">,
  tournament?: AxisTournament,
): number {
  if (tournament?.rounds?.length) return tournament.currentRoundIndex ?? -1;
  return stage.currentRoundIndex ?? -1;
}

/**
 * The stage's teams in seed order — seed N is element N-1.
 *
 * `teamIds` is authoritative once set. Flattening `pools` reproduces the same
 * order for a pre-migration stage, which is what `buildBracketView` has always
 * numbered seeds against.
 */
export function stageTeamIds(
  stage: Pick<StageDocument, "teamIds" | "pools">,
): Types.ObjectId[] {
  if (stage.teamIds?.length) return stage.teamIds;
  return (stage.pools ?? []).flatMap((pool) => pool.teamIds);
}

/**
 * True once this stage has been migrated to the tournament-level axis.
 *
 * Writes use this: a migrated stage must not have rounds pushed back onto it,
 * and a pre-migration stage must keep being written the old way until its
 * tournament is converted.
 */
export function usesTournamentAxis(tournament?: AxisTournament): boolean {
  return Boolean(tournament?.rounds?.length);
}

/**
 * Trades in force during this stage.
 *
 * All of the tournament's, not a slice: a trade is tournament-wide by design —
 * a roster change made during the group phase still holds in the playoffs — and
 * `activeRound` indexes the same axis every stage is laid out against.
 */
export function stageTrades(
  stage: Pick<StageDocument, "trades">,
  tournament?: AxisTournament,
): TradeLike[] {
  if (usesTournamentAxis(tournament)) return tournament!.trades ?? [];
  return stage.trades ?? [];
}

/**
 * Everything needed to replay a team's trades onto its draft roster.
 *
 * Built explicitly at each call site rather than derived inside the roster
 * walk, so it is visible where a caller has no tournament to hand and is
 * therefore reading a stage's legacy trades.
 */
export interface RosterContext {
  /**
   * Brand. Without it a raw `StageDocument` satisfies this interface — it has
   * all three fields — so every call site that had not been converted would
   * still typecheck while quietly reading the legacy stage fields. The brand
   * makes `rosterContext()` the only way to produce one.
   */
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

/**
 * A roster context with no stage in it.
 *
 * Once rounds and trades are tournament-wide, replaying a team's trades needs
 * nothing from any one stage — which is why the tournament-level trade paths
 * take this instead of picking an arbitrary stage to read through.
 */
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

/**
 * The roster context for a tournament as a whole, on whichever axis it is on.
 *
 * "Which Pokémon does this team hold" is a tournament-wide question, but every
 * caller asking it was picking an axis by hand and falling back to `undefined`
 * — no trade context at all — whenever it had not resolved a stage. That
 * fallback drops every trade, and it is wrong for a migrated tournament, which
 * owns its trades outright and has a context whether or not any stage exists.
 *
 * `stage` is a stage the caller has already resolved; it is consulted only on
 * the legacy path, where trades still live on the stage. Without one, a
 * pre-migration tournament with exactly one stage resolves to that stage, and
 * anything more ambiguous returns undefined — the caller has to say which.
 */
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
