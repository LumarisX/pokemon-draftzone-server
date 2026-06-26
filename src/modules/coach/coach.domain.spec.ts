import { CoachDocument } from "./coach.schema";
import { isOwnedBy } from "./coach.domain";

function buildCoach(auth0Id: string): CoachDocument {
  return { auth0Id } as unknown as CoachDocument;
}

describe("isOwnedBy", () => {
  it("returns false when sub is undefined", () => {
    expect(isOwnedBy(buildCoach("auth0|coach-1"), undefined)).toBe(false);
  });

  it("returns true when sub matches the coach's auth0Id", () => {
    expect(isOwnedBy(buildCoach("auth0|coach-1"), "auth0|coach-1")).toBe(true);
  });

  it("returns false when sub doesn't match the coach's auth0Id", () => {
    expect(isOwnedBy(buildCoach("auth0|coach-1"), "auth0|coach-2")).toBe(false);
  });
});
