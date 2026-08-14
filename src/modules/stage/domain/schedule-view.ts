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
    slot?.type === "winner" ? "Winner" : slot?.type === "loser" ? "Loser" : null;

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
  const keep = options.keepUnresolvedOpponent
    ? (matchup: PopulatedStageMatchup) =>
        Boolean(matchup.side1.team ?? matchup.side2.team)
    : hasResolvedSides;

  return matchups
    .filter(keep)
    .map((matchup) => toScheduleMatchup(matchup, options));
}
