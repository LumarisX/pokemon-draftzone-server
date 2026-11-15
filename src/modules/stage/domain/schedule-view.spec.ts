import { Types } from "mongoose";
import { rosterVisibilityFor } from "./roster-visibility";
import { toScheduleMatchup } from "./schedule-view";
import { rosterContext } from "./stage-axis";

const OWNER = "auth0|owner";
const COACH_A = "auth0|coach-a";
const COACH_B = "auth0|coach-b";

function pool(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    picksVisibleTo: "ownTeam" as const,
    status: "IN_PROGRESS",
    ...overrides,
  };
}

function team(name: string, sub: string, draftId: Types.ObjectId) {
  const coach = {
    _id: new Types.ObjectId(),
    name: `${name} coach`,
    auth0Id: sub,
  };
  return {
    _id: new Types.ObjectId(),
    teamName: name,
    slug: name.toLowerCase(),
    draftId,
    primaryCoach: coach,
    coaches: [coach],
    pickLog: [{ pokemon: { id: `${name.toLowerCase()}-mon` } }],
  } as any;
}

function view(
  blindPool: ReturnType<typeof pool>,
  sub: string | undefined,
  tournamentOverrides: Record<string, unknown> = {},
) {
  const tournament = { owner: OWNER, staff: [], ...tournamentOverrides } as any;
  const a = team("Alpha", COACH_A, blindPool._id);
  const b = team("Bravo", COACH_B, blindPool._id);
  const matchup = {
    _id: new Types.ObjectId(),
    slug: "m1",
    side1: { team: a, score: 0 },
    side2: { team: b, score: 0 },
    results: [],
  } as any;
  const result = toScheduleMatchup(matchup, {
    roster: rosterContext({ trades: [], rounds: [], currentRoundIndex: -1 }),
    canSeeRoster: rosterVisibilityFor(tournament, [blindPool], sub),
    roundIndex: -1,
    forfeitGameDiff: 3,
  });
  return {
    team1: result.team1.draft.map((p) => p.id),
    team2: result.team2.draft.map((p) => p.id),
  };
}

describe("schedule roster visibility", () => {
  it("hides both rosters of a blind pool from an anonymous viewer", () => {
    expect(view(pool(), undefined)).toEqual({ team1: [], team2: [] });
  });

  it("hides both rosters from a signed-in stranger", () => {
    expect(view(pool(), "auth0|stranger")).toEqual({ team1: [], team2: [] });
  });

  it("shows a coach their own side but not the opponent's", () => {
    expect(view(pool(), COACH_A)).toEqual({
      team1: ["alpha-mon"],
      team2: [],
    });
    expect(view(pool(), COACH_B)).toEqual({
      team1: [],
      team2: ["bravo-mon"],
    });
  });

  it("shows an organizer both rosters", () => {
    expect(view(pool(), OWNER)).toEqual({
      team1: ["alpha-mon"],
      team2: ["bravo-mon"],
    });
  });

  it("leaves a finished blind pool unchanged", () => {
    expect(view(pool({ status: "COMPLETED" }), undefined)).toEqual({
      team1: ["alpha-mon"],
      team2: ["bravo-mon"],
    });
  });

  it("leaves a non-blind pool unchanged", () => {
    expect(view(pool({ picksVisibleTo: "everyone" }), undefined)).toEqual({
      team1: ["alpha-mon"],
      team2: ["bravo-mon"],
    });
  });
});
