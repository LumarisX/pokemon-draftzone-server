import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ExternalTournamentDto } from "./external-tournament.dto";

const mon = (i: number) => ({ id: `mon${i}`, name: `Mon ${i}` });

const body = (overrides: Record<string, unknown> = {}) => ({
  leagueName: "Test League",
  teamName: "Team",
  format: "Singles",
  ruleset: "Gen9 NatDex",
  doc: "https://example.com/doc",
  coach: "Coach",
  team: Array.from({ length: 12 }, (_, i) => mon(i)),
  ...overrides,
});

const check = (value: unknown) =>
  validate(plainToInstance(ExternalTournamentDto, value));

describe("ExternalTournamentDto limits", () => {
  it("accepts a realistic body", async () => {
    expect(await check(body())).toHaveLength(0);
  });

  it("rejects a roster over 60", async () => {
    const team = Array.from({ length: 61 }, (_, i) => mon(i));
    expect(await check(body({ team }))).not.toHaveLength(0);
  });

  it("rejects a league name over 100", async () => {
    expect(await check(body({ leagueName: "x".repeat(101) }))).not.toHaveLength(
      0,
    );
  });
});
