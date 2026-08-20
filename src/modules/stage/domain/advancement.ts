/**
 * Who moves out of a bracket match, and into what.
 *
 * A `winner`/`loser` slot reads its team off the match it names, so a match
 * that ends without a winning side feeds nothing: a double forfeit (`winner:
 * "draw"`, `forfeit: true`) leaves every downstream slot permanently empty,
 * and the rest of the bracket can never be played. `advances` is the
 * organizer's override for exactly that — it names the side that moves on
 * despite the result, or declares outright that nobody does.
 */

export type MatchupAdvancement = "side1" | "side2" | "none";

export interface AdvancementOutcome {
  winner?: string | null;
  advances?: MatchupAdvancement | null;
}

export interface AdvancementSides {
  /** The side a `winner` slot takes its team from, if any. */
  winner: "side1" | "side2" | null;
  /** The side a `loser` slot takes its team from, if any. */
  loser: "side1" | "side2" | null;
}

const NEITHER: AdvancementSides = { winner: null, loser: null };

export function advancingSides(matchup: AdvancementOutcome): AdvancementSides {
  if (matchup.advances === "none") return NEITHER;
  if (matchup.advances === "side1") return { winner: "side1", loser: "side2" };
  if (matchup.advances === "side2") return { winner: "side2", loser: "side1" };
  if (matchup.winner === "side1") return { winner: "side1", loser: "side2" };
  if (matchup.winner === "side2") return { winner: "side2", loser: "side1" };
  return NEITHER;
}

/** Nobody leaves this match, whatever the reason. */
export function yieldsNobody(matchup: AdvancementOutcome): boolean {
  const sides = advancingSides(matchup);
  return sides.winner === null && sides.loser === null;
}

export interface AdvancementSlot {
  type: string;
  matchId?: string | null;
}

export interface AdvancementMatchup extends AdvancementOutcome {
  id: string;
  side1: { slot?: AdvancementSlot | null; team?: string | null };
  side2: { slot?: AdvancementSlot | null; team?: string | null };
}

export type AdvancementResolution = Map<
  string,
  { side1?: string | null; side2?: string | null }
>;

/**
 * The matches that have stopped the bracket: nobody leaves them, something
 * downstream is waiting on one, and no organizer has said what to do about it.
 *
 * Two shapes, and the second is why this needs the whole bracket rather than
 * one match at a time. The first is a double forfeit — settled, with no winning
 * side. The second is what a `"none"` ruling creates one round later: that
 * match is not settled and never can be, because a side of it is fed by a slot
 * nothing will ever arrive in. Both leave the bracket unplayable, and both are
 * fixed the same way, so both have to be findable.
 */
export function blockedMatchups(matchups: AdvancementMatchup[]): Set<string> {
  const byId = new Map(matchups.map((matchup) => [matchup.id, matchup]));

  const referenced = new Set<string>();
  for (const matchup of matchups) {
    for (const side of [matchup.side1, matchup.side2]) {
      const slot = side.slot;
      if (!slot?.matchId) continue;
      if (slot.type === "winner" || slot.type === "loser")
        referenced.add(slot.matchId);
    }
  }

  // A side is dead when the slot feeding it can never produce a team — as
  // opposed to merely not having one yet, which is every unplayed match.
  const deadSide = new Map<string, boolean>();
  const visiting = new Set<string>();

  const isDeadSide = (matchupId: string, side: "side1" | "side2"): boolean => {
    const key = `${matchupId}:${side}`;
    if (deadSide.has(key)) return deadSide.get(key)!;
    if (visiting.has(key)) return false;

    const matchup = byId.get(matchupId);
    const slot = matchup?.[side].slot;
    if (!matchup || !slot || (slot.type !== "winner" && slot.type !== "loser"))
      return false;

    visiting.add(key);
    const source = slot.matchId ? byId.get(slot.matchId) : undefined;
    const dead = source
      ? yieldsNobody(source) && isSettledOrDead(source)
      : false;
    visiting.delete(key);

    deadSide.set(key, dead);
    return dead;
  };

  // Settled by a result or a ruling, or unplayable because a side of it is
  // dead — either way the match will not produce anyone by being played.
  const isSettledOrDead = (matchup: AdvancementMatchup): boolean =>
    Boolean(matchup.advances) ||
    Boolean(matchup.winner) ||
    isDeadSide(matchup.id, "side1") ||
    isDeadSide(matchup.id, "side2");

  return new Set(
    matchups
      .filter(
        (matchup) =>
          referenced.has(matchup.id) &&
          !matchup.advances &&
          yieldsNobody(matchup) &&
          isSettledOrDead(matchup),
      )
      .map((matchup) => matchup.id),
  );
}

/**
 * The team that belongs in every winner/loser-fed side of a bracket.
 *
 * Resolved through the slot graph rather than one hop at a time, so correcting
 * a match near the top of the bracket carries all the way down — including
 * through matches that were themselves already decided. A side maps to `null`
 * when nothing advances into it, which is what un-sticks a slot that an
 * earlier, wrong advancement had already filled.
 */
export function resolveBracketAdvancement(
  matchups: AdvancementMatchup[],
): AdvancementResolution {
  const byId = new Map(matchups.map((matchup) => [matchup.id, matchup]));
  const memo = new Map<string, string | null>();
  const visiting = new Set<string>();

  const teamIn = (
    matchupId: string,
    side: "side1" | "side2",
  ): string | null => {
    const key = `${matchupId}:${side}`;
    if (memo.has(key)) return memo.get(key)!;
    // The bracket validator rejects cycles, but a resolver that walks stored
    // documents must not hang on one that slipped in some other way.
    if (visiting.has(key)) return null;

    const matchup = byId.get(matchupId);
    if (!matchup) return null;
    const slot = matchup[side].slot;

    if (!slot || (slot.type !== "winner" && slot.type !== "loser"))
      return matchup[side].team ?? null;

    visiting.add(key);
    let team: string | null = null;
    if (slot.matchId) {
      const source = byId.get(slot.matchId);
      if (source) {
        const from = advancingSides(source)[slot.type];
        if (from) team = teamIn(source.id, from);
      }
    }
    visiting.delete(key);

    memo.set(key, team);
    return team;
  };

  const resolution: AdvancementResolution = new Map();
  for (const matchup of matchups) {
    const entry: { side1?: string | null; side2?: string | null } = {};
    for (const side of ["side1", "side2"] as const) {
      const slot = matchup[side].slot;
      if (!slot || (slot.type !== "winner" && slot.type !== "loser")) continue;
      entry[side] = teamIn(matchup.id, side);
    }
    if (entry.side1 !== undefined || entry.side2 !== undefined)
      resolution.set(matchup.id, entry);
  }
  return resolution;
}
