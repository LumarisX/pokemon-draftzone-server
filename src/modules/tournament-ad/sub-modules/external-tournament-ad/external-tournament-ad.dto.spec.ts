import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";

// Mirrors what the client league-form submits: optional fields default to "".
function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    leagueName: "Spring League",
    description: "A friendly league",
    leagueDoc: "",
    serverLink: "",
    skillLevelRange: { from: "0", to: "3" },
    prizeValue: "0",
    platforms: ["Pokémon Showdown"],
    formats: ["Singles"],
    rulesets: ["Gen9 NatDex"],
    signupLink: "https://example.com/signup",
    closesAt: "2026-07-24",
    seasonStart: "",
    seasonEnd: "",
    ...overrides,
  };
}

describe("ExternalTournamentAdDto", () => {
  it("treats empty-string optional fields as absent", async () => {
    const dto = plainToInstance(ExternalTournamentAdDto, buildPayload());

    const errors = await validate(dto);

    expect(errors).toEqual([]);
    expect(dto.leagueDoc).toBeUndefined();
    expect(dto.serverLink).toBeUndefined();
    expect(dto.seasonStart).toBeUndefined();
    expect(dto.seasonEnd).toBeUndefined();
  });

  it("converts filled optional dates to Date instances", async () => {
    const dto = plainToInstance(
      ExternalTournamentAdDto,
      buildPayload({ seasonStart: "2026-08-01", seasonEnd: "2026-10-01" }),
    );

    const errors = await validate(dto);

    expect(errors).toEqual([]);
    expect(dto.seasonStart).toEqual(new Date("2026-08-01"));
    expect(dto.seasonEnd).toEqual(new Date("2026-10-01"));
  });

  it("still rejects a filled-in invalid URL", async () => {
    const dto = plainToInstance(
      ExternalTournamentAdDto,
      buildPayload({ leagueDoc: "not a url" }),
    );

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("leagueDoc");
  });

  it("still rejects an unparseable season date", async () => {
    const dto = plainToInstance(
      ExternalTournamentAdDto,
      buildPayload({ seasonStart: "not a date" }),
    );

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("seasonStart");
  });
});
