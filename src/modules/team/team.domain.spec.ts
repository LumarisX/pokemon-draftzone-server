import { CoachDocument } from "@modules/coach/coach.schema";
import { Types } from "mongoose";
import { PopulatedTeam } from "./team.repository";
import { isCoachedBy } from "./team.domain";

function buildTeam(overrides: Record<string, unknown> = {}): PopulatedTeam {
  const base = {
    _id: new Types.ObjectId(),
    coach: {
      _id: new Types.ObjectId(),
      auth0Id: "auth0|coach-1",
    } as CoachDocument,
    pickLog: [],
    ...overrides,
  };
  const seat = (base as { coach?: unknown }).coach;
  return {
    ...base,
    primaryCoach: seat,
    coaches: seat ? [seat] : [],
  } as unknown as PopulatedTeam;
}

describe("isCoachedBy", () => {
  it("returns false for a coach who has left the team", () => {
    const team = buildTeam({
      coach: {
        _id: new Types.ObjectId(),
        auth0Id: "auth0|coach-1",
        leftAt: new Date(),
      } as unknown as CoachDocument,
    });

    expect(isCoachedBy(team, "auth0|coach-1", "report")).toBe(false);
  });

  it("returns true when sub matches the team's coach", () => {
    const team = buildTeam({
      coach: {
        _id: new Types.ObjectId(),
        auth0Id: "auth0|coach-1",
      } as CoachDocument,
    });

    expect(isCoachedBy(team, "auth0|coach-1", "chat")).toBe(true);
  });

  it("returns false when sub doesn't match the team's coach", () => {
    const team = buildTeam({
      coach: {
        _id: new Types.ObjectId(),
        auth0Id: "auth0|coach-1",
      } as CoachDocument,
    });

    expect(isCoachedBy(team, "auth0|other", "chat")).toBe(false);
  });

  it("returns false when sub is undefined", () => {
    const team = buildTeam({
      coach: {
        _id: new Types.ObjectId(),
        auth0Id: "auth0|coach-1",
      } as CoachDocument,
    });

    expect(isCoachedBy(team, undefined, "chat")).toBe(false);
  });
});
