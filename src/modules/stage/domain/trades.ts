import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Types } from "mongoose";
import { TradeLike } from "./stage-axis";

type TradeSide = TradeLike["side1"];

function sideTeamId(side: TradeSide): string | undefined {
  if (!side.team) return undefined;
  return side.team instanceof Types.ObjectId
    ? side.team.toString()
    : side.team._id.toString();
}

/**
 * Trade points already committed per team, counting only APPROVED trades.
 *
 * `exclude` skips the trade being re-evaluated, so approving a pending trade
 * does not count it against itself.
 */
export function spentTradePoints(
  trades: TradeLike[],
  exclude?: TradeLike | null,
): Map<string, number> {
  const spent = new Map<string, number>();
  for (const trade of trades) {
    if (trade.status !== "APPROVED") continue;
    if (exclude && trade === exclude) continue;
    for (const side of [trade.side1, trade.side2]) {
      const teamId = sideTeamId(side);
      if (!teamId) continue;
      spent.set(teamId, (spent.get(teamId) ?? 0) + (side.tradePoints ?? 0));
    }
  }
  return spent;
}

/**
 * Throws unless both sides stay within the tournament's trade point cap.
 *
 * Shared by the stage-scoped and tournament-scoped trade paths: the cap is a
 * tournament setting either way, and two implementations of a spending limit
 * is two places for it to be enforced differently.
 */
export function assertTradePointsWithinLimit(options: {
  trades: TradeLike[];
  limit: number | null | undefined;
  trade: { side1: TradeSide; side2: TradeSide };
  exclude?: TradeLike | null;
}): void {
  const { limit } = options;
  if (limit === undefined || limit === null) return;

  const spent = spentTradePoints(options.trades, options.exclude);
  for (const side of [options.trade.side1, options.trade.side2]) {
    const teamId = sideTeamId(side);
    if (!teamId) continue;
    const total = (spent.get(teamId) ?? 0) + (side.tradePoints ?? 0);
    if (total > limit)
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        teamId,
        reason: `Team would spend ${total} trade points, over the limit of ${limit}`,
      });
  }
}
