import { CoachDocument } from "@modules/coach/coach.schema";
import { PopulatedTeam } from "./team.repository";
import { getDraftedPokemonIds, isCoachedBy } from "./team.domain";

function buildTeam(overrides: Record<string, unknown> = {}): PopulatedTeam {
  return {
    coach: { auth0Id: "auth0|coach-1" } as CoachDocument,
    pickLog: [],
    ...overrides,
  } as unknown as PopulatedTeam;
}

describe("getDraftedPokemonIds", () => {
  it("returns an empty array when nothing has been picked", () => {
    expect(getDraftedPokemonIds(buildTeam())).toEqual([]);
  });

  it("maps the pick log to the picked Pokemon's ids, in order", () => {
    const team = buildTeam({
      pickLog: [
        { pokemon: { id: "pikachu" } },
        { pokemon: { id: "charizard" } },
      ],
    } as any);

    expect(getDraftedPokemonIds(team)).toEqual(["pikachu", "charizard"]);
  });
});

describe("isCoachedBy", () => {
  it("returns true when sub matches the team's coach", () => {
    const team = buildTeam({ coach: { auth0Id: "auth0|coach-1" } as CoachDocument });

    expect(isCoachedBy(team, "auth0|coach-1")).toBe(true);
  });

  it("returns false when sub doesn't match the team's coach", () => {
    const team = buildTeam({ coach: { auth0Id: "auth0|coach-1" } as CoachDocument });

    expect(isCoachedBy(team, "auth0|other")).toBe(false);
  });

  it("returns false when sub is undefined", () => {
    const team = buildTeam({ coach: { auth0Id: "auth0|coach-1" } as CoachDocument });

    expect(isCoachedBy(team, undefined)).toBe(false);
  });
});
