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

export function toScheduleMatchup(
  matchup: PopulatedStageMatchup,
  options: ScheduleViewOptions,
) {
  const side = (which: "side1" | "side2") => {
    const team = matchup[which].team!;
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
      draft: rosterFor(team, options),
    };
  };

  return {
    id: matchup._id.toString(),
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

/**
 * Bracket matchups whose winner/loser slots are still unresolved have no teams
 * to show, so they are not on anyone's schedule yet.
 */
export function scheduleMatchups(
  matchups: PopulatedStageMatchup[],
  options: ScheduleViewOptions,
) {
  return matchups
    .filter(hasResolvedSides)
    .map((matchup) => toScheduleMatchup(matchup, options));
}
