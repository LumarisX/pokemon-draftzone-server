import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { SignUpDto, UpdateTeamDto } from "./hosted-tournament.dto";

const SIGN_UP = {
  name: "Ash Ketchum",
  gameName: "AshK",
  discordName: "ash#1234",
  timezone: "America/Los_Angeles",
  confirm: true,
};

function signUpErrors(extra: Record<string, unknown>) {
  return validateSync(plainToInstance(SignUpDto, { ...SIGN_UP, ...extra })).map(
    (error) => error.property,
  );
}

describe("SignUpDto team identity", () => {
  it("accepts a typed team name", () => {
    expect(signUpErrors({ teamName: "Team Rocket" })).toEqual([]);
  });

  it("accepts an identity in place of a team name", () => {
    expect(
      signUpErrors({ identity: { pack: "starter", id: "miami-palafins" } }),
    ).toEqual([]);
  });

  it("requires a team name when no identity is chosen", () => {
    expect(signUpErrors({})).toEqual(["teamName"]);
  });

  it("rejects an identity missing its pack or id", () => {
    expect(signUpErrors({ identity: { pack: "starter" } })).toEqual([
      "identity",
    ]);
    expect(signUpErrors({ identity: { pack: "", id: "x" } })).toEqual([
      "identity",
    ]);
  });

  it("accepts a saved team in place of a pack identity", () => {
    expect(
      signUpErrors({ identity: { saved: "65f1c2a9e4b0a1b2c3d4e5f6" } }),
    ).toEqual([]);
  });

  it("rejects a saved team that is not an id, or an empty identity", () => {
    expect(signUpErrors({ identity: { saved: "not-an-id" } })).toEqual([
      "identity",
    ]);
    expect(signUpErrors({ identity: {} })).toEqual(["identity"]);
  });
});

describe("UpdateTeamDto team identity", () => {
  it("accepts an identity on its own", () => {
    expect(
      validateSync(
        plainToInstance(UpdateTeamDto, {
          identity: { pack: "starter", id: "sinnoh-jazz" },
        }),
      ),
    ).toEqual([]);
  });
});
