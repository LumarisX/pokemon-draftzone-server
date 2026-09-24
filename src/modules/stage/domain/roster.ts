import { Types } from "mongoose";
import { PopulatedTeam } from "@modules/team/team.repository";
import { RosterContext, TradeLike, tradeRoundIndex } from "./stage-axis";

function getTradeTeamId(team?: Types.ObjectId | { _id: Types.ObjectId }) {
  if (!team) return undefined;
  if (team instanceof Types.ObjectId) {
    return team.toString();
  }
  return team._id.toString();
}

export function updateRosterWithTrades(
  teamId: Types.ObjectId,
  roster: { id: string; addons?: string[] }[],
  trades: TradeLike[],
) {
  const teamIdString = teamId.toString();
  for (const trade of trades) {
    const side1TeamId = getTradeTeamId(trade.side1.team);
    const side2TeamId = getTradeTeamId(trade.side2.team);
    if (side1TeamId !== teamIdString && side2TeamId !== teamIdString) continue;
    const side = side1TeamId === teamIdString ? trade.side1 : trade.side2;
    const otherSide = side1TeamId === teamIdString ? trade.side2 : trade.side1;

    const sentPokemonIds = new Set(side.pokemon.map((p) => p.id));
    const receivedPokemonIds = new Set(otherSide.pokemon.map((p) => p.id));

    roster = [
      ...roster.filter(
        (pokemon) =>
          !sentPokemonIds.has(pokemon.id) &&
          !receivedPokemonIds.has(pokemon.id),
      ),
      ...otherSide.pokemon,
    ];
  }
  return roster;
}

function approvedTradesByRound(
  team: PopulatedTeam,
  context: RosterContext,
): Map<number, TradeLike[]> {
  const teamIdString = team._id.toString();
  const byRound = new Map<number, TradeLike[]>();
  for (const trade of context.trades) {
    if (trade.status !== "APPROVED") continue;
    if (
      getTradeTeamId(trade.side1.team) !== teamIdString &&
      getTradeTeamId(trade.side2.team) !== teamIdString
    )
      continue;
    const round = tradeRoundIndex(trade, context.rounds);
    byRound.set(round, [...(byRound.get(round) ?? []), trade]);
  }
  return byRound;
}

function pickLogRoster(team: PopulatedTeam) {
  return team.pickLog.map((p) => ({
    id: p.pokemon.id,
    addons: p.addons,
  })) as { id: string; addons?: string[] }[];
}

export function getRostersBeforeRound(
  team: PopulatedTeam,
  context: RosterContext | undefined,
  roundIndex?: number,
) {
  let roster = pickLogRoster(team);
  const rosters = [[...roster]];

  if (!context) return rosters;

  const roundTrades = approvedTradesByRound(team, context);
  for (let r = 0; r < (roundIndex ?? context.rounds.length); r++) {
    const trades = roundTrades.get(r);
    if (trades) roster = updateRosterWithTrades(team._id, roster, trades);
    rosters.push([...roster]);
  }
  return rosters;
}

export function getRosterByRound(
  team: PopulatedTeam,
  context: RosterContext | undefined,
  roundIndex?: number,
) {
  let roster = pickLogRoster(team);

  if (!context) return roster;

  const roundTrades = approvedTradesByRound(team, context);
  for (let r = 0; r <= (roundIndex ?? context.currentRoundIndex); r++) {
    const trades = roundTrades.get(r);
    if (trades) roster = updateRosterWithTrades(team._id, roster, trades);
  }
  return roster;
}

export function getLatestRoster(
  team: PopulatedTeam,
  context: RosterContext | undefined,
) {
  return getRosterByRound(team, context, context?.rounds.length);
}
