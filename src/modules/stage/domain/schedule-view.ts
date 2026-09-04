import { MatchupAdvancement } from "./advancement";
import { MatchLabel } from "./match-labels";
import { getRosterByRound } from "./roster";
import { RosterContext } from "./stage-axis";
import { hasResolvedSides, PopulatedStageMatchup } from "./standings";

/**
 * Shapes a matchup for the schedule views.
 *
 * Extracted so the stage-scoped and tournament-scoped schedules render the
 * same payload. The forfeit handling in particular is easy to get subtly
 * different: a forfeited match shows the tournament's configured game
 * difference for the winner and zero for the loser, rather than the recorded
 * score, and the `winner` field carries a distinct "ffw"/"dffl" marker.
 */
export interface ScheduleViewOptions {
  /** Trades and rounds to replay a roster against. */
  roster: RosterContext;
  /** Index into the round axis, for the roster snapshot. */
  roundIndex: number;
  /** `tournament.forfeit.gameDiff` — the score a forfeit is displayed as. */
  forfeitGameDiff: number;
  keepUnresolvedOpponent?: boolean;
  /**
   * Bracket names for every match in the stage, keyed by matchup id. Supplies
   * both the card's own label and the name an unresolved slot points at, so
   * "Winner of Match 4" and the card called Match 4 always agree.
   */
  matchLabels?: Map<string, MatchLabel>;
  /**
   * Matches that have stopped the bracket — settled with no side leaving them
   * while something downstream still waits on one. Computed over the whole
   * bracket, so it has to be passed in rather than derived per card.
   */
  blockedMatchIds?: ReadonlySet<string>;
}

function rosterFor(
  team: PopulatedStageMatchup["side1"]["team"],
  options: ScheduleViewOptions,
) {
  return getRosterByRound(team!, options.roster, options.roundIndex).map(
    (pokemon) => ({
      id: pokemon.id,
      capt: {
        ...(pokemon.addons?.includes("Tera Captain") ? { tera: true } : {}),
      },
    }),
  );
}

export interface ScheduleSide {
  name: string;
  coach: string;
  score?: number;
  logo?: string;
  id: string | null;
  slug: string | null;
  from: { slug: string; label: string } | null;
  draft: ReturnType<typeof rosterFor>;
}

function unresolvedSide(
  slot: PopulatedStageMatchup["side1"]["slot"],
  options: ScheduleViewOptions,
): ScheduleSide {
  const source = slot?.matchId
    ? (options.matchLabels?.get(slot.matchId) ?? null)
    : null;
  const outcome =
    slot?.type === "winner"
      ? "Winner"
      : slot?.type === "loser"
        ? "Loser"
        : null;

  const name =
    slot?.type === "seed" && slot.seed
      ? `Seed ${slot.seed}`
      : outcome && source
        ? `${outcome} of ${source.label}`
        : "TBD";

  return {
    name,
    coach: "",
    score: 0,
    logo: undefined,
    id: null,
    slug: null,
    from:
      outcome && source?.slug
        ? { slug: source.slug, label: source.label }
        : null,
    draft: [],
  };
}

export function toScheduleMatchup(
  matchup: PopulatedStageMatchup,
  options: ScheduleViewOptions,
) {
  const side = (which: "side1" | "side2"): ScheduleSide => {
    const team = matchup[which].team;
    if (!team) return unresolvedSide(matchup[which].slot, options);
    return {
      name: team.teamName,
      coach: team.coach.name,
      score: matchup.forfeit
        ? matchup.winner === which
          ? options.forfeitGameDiff
          : 0
        : matchup[which].score,
      logo: team.logo,
      id: team._id.toString(),
      slug: team.slug,
      from: null,
      draft: rosterFor(team, options),
    };
  };

  return {
    id: matchup._id.toString(),
    slug: matchup.slug,
    label: options.matchLabels?.get(matchup._id.toString())?.label,
    scheduledDate: matchup.scheduledDate ?? null,
    team1: side("side1"),
    team2: side("side2"),
    matches: matchup.results.map((result) => ({
      link: result.replay,
      team1: {
        team: Object.fromEntries(result.side1.pokemon.entries()),
        score: result.side1.score,
        winner: result.winner === "side1",
      },
      team2: {
        team: Object.fromEntries(result.side2.pokemon.entries()),
        score: result.side2.score,
        winner: result.winner === "side2",
      },
    })),
    score: { team1: matchup.side1.score, team2: matchup.side2.score },
    // The organizer's override for who leaves this match, and whether one is
    // still needed. A double forfeit decides nothing, so a match below it can
    // never be filled until somebody says who moves on.
    advances: (matchup.advances ?? null) as MatchupAdvancement | null,
    advancementBlocked:
      options.blockedMatchIds?.has(matchup._id.toString()) ?? false,
    winner: matchup.forfeit
      ? matchup.winner === "side1"
        ? "side1ffw"
        : matchup.winner === "side2"
          ? "side2ffw"
          : "dffl"
      : matchup.winner,
  };
}

export function scheduleMatchups(
  matchups: PopulatedStageMatchup[],
  options: ScheduleViewOptions,
) {
  // Two reasons to keep a match whose sides are not both filled.
  //
  // Blocked: that side is empty for good — it is fed by a slot nothing will
  // ever arrive in — so dropping it as "not resolved yet" hides the one card an
  // organizer has to act on.
  //
  // Walked over: the organizer already answered, by recording a result for the
  // side that does have a team. That clears the blocked flag, so without this
  // the card would vanish the moment it was dealt with — taking a real recorded
  // result out of view along with it.
  const isBlocked = (matchup: PopulatedStageMatchup) =>
    options.blockedMatchIds?.has(matchup._id.toString()) ?? false;
  const isWalkover = (matchup: PopulatedStageMatchup) =>
    Boolean(matchup.winner) &&
    Boolean(matchup.side1.team ?? matchup.side2.team);

  const keep = options.keepUnresolvedOpponent
    ? (matchup: PopulatedStageMatchup) =>
        Boolean(matchup.side1.team ?? matchup.side2.team) || isBlocked(matchup)
    : (matchup: PopulatedStageMatchup) =>
        hasResolvedSides(matchup) || isBlocked(matchup) || isWalkover(matchup);

  return matchups
    .filter(keep)
    .map((matchup) => toScheduleMatchup(matchup, options));
}
