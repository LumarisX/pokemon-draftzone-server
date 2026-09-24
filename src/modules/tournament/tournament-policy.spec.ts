import {
  can,
  isStaff,
  ROLE_ACTIONS,
  rolesOf,
  TOURNAMENT_ACTIONS,
} from "./tournament-policy";

const tournament = { owner: "auth0|owner", organizers: ["auth0|org"] };

describe("tournament policy", () => {
  it("gives the owner both roles and every action", () => {
    expect(rolesOf(tournament, "auth0|owner")).toEqual(["owner", "organizer"]);
    for (const action of TOURNAMENT_ACTIONS)
      expect(can(tournament, "auth0|owner", action)).toBe(true);
  });

  it("gives an organizer everything except managing staff", () => {
    expect(rolesOf(tournament, "auth0|org")).toEqual(["organizer"]);
    expect(can(tournament, "auth0|org", "manageResults")).toBe(true);
    expect(can(tournament, "auth0|org", "viewStaff")).toBe(true);
    expect(can(tournament, "auth0|org", "manageStaff")).toBe(false);
  });

  it("gives everyone else nothing", () => {
    for (const sub of ["auth0|coach", undefined]) {
      expect(isStaff(tournament, sub)).toBe(false);
      for (const action of TOURNAMENT_ACTIONS)
        expect(can(tournament, sub, action)).toBe(false);
    }
  });

  it("maps every role to actions that exist", () => {
    for (const actions of Object.values(ROLE_ACTIONS))
      for (const action of actions)
        expect(TOURNAMENT_ACTIONS).toContain(action);
  });
});
