export type MatchupAdvancement = "side1" | "side2" | "none";

type Side = "side1" | "side2";

export interface AdvancementOutcome {
  winner?: string | null;
  advances?: MatchupAdvancement | null;
}

export interface AdvancementSides {
  winner: Side | null;
  loser: Side | null;
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

export interface AdvancementSlot {
  type: string;
  matchId?: string | null;
}

export interface AdvancementMatchup extends AdvancementOutcome {
  id: string;
  side1: { slot?: AdvancementSlot | null; team?: string | null };
  side2: { slot?: AdvancementSlot | null; team?: string | null };
}

export type Walkover = Side | "void";

export interface MatchupExit extends AdvancementSides {
  settled: boolean;
  walkover: Walkover | null;
}

const OPEN: MatchupExit = { ...NEITHER, settled: false, walkover: null };

export function bracketExits(
  matchups: AdvancementMatchup[],
): Map<string, MatchupExit> {
  const byId = new Map(matchups.map((matchup) => [matchup.id, matchup]));
  const memo = new Map<string, MatchupExit>();
  const visiting = new Set<string>();

  const isDeadSide = (matchup: AdvancementMatchup, side: Side): boolean => {
    const slot = matchup[side].slot;
    if (!slot?.matchId || (slot.type !== "winner" && slot.type !== "loser"))
      return false;
    const source = byId.get(slot.matchId);
    if (!source) return false;
    const exit = exitOf(source);
    return exit.settled && exit[slot.type] === null;
  };

  const exitOf = (matchup: AdvancementMatchup): MatchupExit => {
    const cached = memo.get(matchup.id);
    if (cached) return cached;
    if (visiting.has(matchup.id)) return OPEN;

    visiting.add(matchup.id);
    let exit: MatchupExit;
    if (matchup.advances || matchup.winner) {
      exit = { ...advancingSides(matchup), settled: true, walkover: null };
    } else {
      const dead1 = isDeadSide(matchup, "side1");
      const dead2 = isDeadSide(matchup, "side2");
      exit =
        dead1 && dead2
          ? { ...NEITHER, settled: true, walkover: "void" }
          : dead1
            ? { winner: "side2", loser: null, settled: true, walkover: "side2" }
            : dead2
              ? { winner: "side1", loser: null, settled: true, walkover: "side1" }
              : OPEN;
    }
    visiting.delete(matchup.id);

    memo.set(matchup.id, exit);
    return exit;
  };

  return new Map(matchups.map((matchup) => [matchup.id, exitOf(matchup)]));
}

export function feedingMatchups(matchups: AdvancementMatchup[]): Set<string> {
  const feeding = new Set<string>();
  for (const matchup of matchups) {
    for (const side of [matchup.side1, matchup.side2]) {
      const slot = side.slot;
      if (slot?.matchId && (slot.type === "winner" || slot.type === "loser"))
        feeding.add(slot.matchId);
    }
  }
  return feeding;
}

export type AdvancementResolution = Map<
  string,
  { side1?: string | null; side2?: string | null }
>;

export function resolveBracketAdvancement(
  matchups: AdvancementMatchup[],
): AdvancementResolution {
  const byId = new Map(matchups.map((matchup) => [matchup.id, matchup]));
  const exits = bracketExits(matchups);
  const memo = new Map<string, string | null>();
  const visiting = new Set<string>();

  const teamIn = (matchupId: string, side: Side): string | null => {
    const key = `${matchupId}:${side}`;
    if (memo.has(key)) return memo.get(key)!;
    if (visiting.has(key)) return null;

    const matchup = byId.get(matchupId);
    if (!matchup) return null;
    const slot = matchup[side].slot;

    if (!slot || (slot.type !== "winner" && slot.type !== "loser"))
      return matchup[side].team ?? null;

    visiting.add(key);
    let team: string | null = null;
    if (slot.matchId) {
      const from = exits.get(slot.matchId)?.[slot.type];
      if (from) team = teamIn(slot.matchId, from);
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
