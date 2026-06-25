import { Types } from "mongoose";
import { PopulatedTeam } from "@modules/team/team.repository";
import { StageDocument, StageTradeEntity } from "@modules/stage/stage.schema";

function getTradeTeamId(team?: Types.ObjectId | { _id: Types.ObjectId }) {
  if (!team) return undefined;
  if (team instanceof Types.ObjectId) {
    return team.toString();
  }
  return team._id.toString();
}

/**
 * Applies a batch of trades (all scoped to the same round) to a team's
 * roster, swapping out anything they sent for whatever they received.
 */
export function updateRosterWithTrades(
  teamId: Types.ObjectId,
  roster: { id: string; addons?: string[] }[],
  trades: StageTradeEntity[],
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

/**
 * Returns the roster snapshot at the start of every round, from round 0
 * (the raw post-draft pick log, before any trade) through `roundIndex`
 * inclusive (defaults to every round in the stage).
 *
 * If `stage` is undefined, there's no trade context to walk — returns just
 * the raw pick log wrapped in a single-element array (covers DraftService's
 * "no stage" raw pick-history views).
 */
export function getRostersBeforeRound(
  team: PopulatedTeam,
  stage: StageDocument | undefined,
  roundIndex?: number,
) {
  let roster: {
    id: string;
    addons?: string[];
  }[] = team.pickLog.map((p) => ({
    id: p.pokemon.id,
    addons: p.addons,
  }));
  const rosters = [[...roster]];

  if (!stage) return rosters;

  const teamIdString = team._id.toString();
  const roundTrades = stage.trades
    .filter(
      (t) =>
        t.status === "APPROVED" &&
        (getTradeTeamId(t.side1.team) === teamIdString ||
          getTradeTeamId(t.side2.team) === teamIdString),
    )
    .reduce((map, t) => {
      const existing = map.get(t.activeRound);
      map.set(t.activeRound, existing ? [...existing, t] : [t]);
      return map;
    }, new Map<number, StageTradeEntity[]>());

  for (let r = 0; r < (roundIndex ?? stage.rounds.length); r++) {
    const trades = roundTrades.get(r);
    if (trades) roster = updateRosterWithTrades(team._id, roster, trades);
    rosters.push([...roster]);
  }
  return rosters;
}

/**
 * Returns a team's roster as of `roundIndex` (defaults to the stage's
 * current round). `team.pickLog` is always the base roster; if `stage` is
 * undefined, the trade-walk is skipped entirely and the raw pick log is
 * returned as-is (covers DraftService's no-stage "raw pick history" views).
 */
export function getRosterByRound(
  team: PopulatedTeam,
  stage: StageDocument | undefined,
  roundIndex?: number,
) {
  let roster: {
    id: string;
    addons?: string[];
  }[] = team.pickLog.map((p) => ({
    id: p.pokemon.id,
    addons: p.addons,
  }));

  if (!stage) return roster;

  const currentRoundIndex = stage.currentRoundIndex;
  const teamIdString = team._id.toString();
  const roundTrades = stage.trades
    .filter(
      (t) =>
        t.status === "APPROVED" &&
        (getTradeTeamId(t.side1.team) === teamIdString ||
          getTradeTeamId(t.side2.team) === teamIdString),
    )
    .reduce((map, t) => {
      const existing = map.get(t.activeRound);
      map.set(t.activeRound, existing ? [...existing, t] : [t]);
      return map;
    }, new Map<number, StageTradeEntity[]>());

  for (let r = 0; r <= (roundIndex ?? currentRoundIndex); r++) {
    const trades = roundTrades.get(r);
    if (trades) roster = updateRosterWithTrades(team._id, roster, trades);
  }
  return roster;
}
