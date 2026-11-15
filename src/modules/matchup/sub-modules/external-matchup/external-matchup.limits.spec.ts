import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ExternalMatchupDto } from "./external-matchup.dto";

const side = (score: number) => ({
  stats: [["garchomp", { kills: 1, brought: 1 }]],
  score,
});

const game = () => ({ aTeam: side(2), bTeam: side(1), winner: "a" });

const body = (overrides: Record<string, unknown> = {}) => ({
  stage: "Week 1",
  teamName: "Opponent",
  coach: "Coach",
  matches: [game()],
  team: [{ id: "garchomp", name: "Garchomp" }],
  ...overrides,
});

const check = (value: unknown) =>
  validate(plainToInstance(ExternalMatchupDto, value));

describe("ExternalMatchupDto limits", () => {
  it("accepts a realistic body", async () => {
    expect(await check(body())).toHaveLength(0);
  });

  it("rejects more than 15 matches", async () => {
    const matches = Array.from({ length: 16 }, game);
    expect(await check(body({ matches }))).not.toHaveLength(0);
  });

  it("rejects a stage over 100 characters", async () => {
    expect(await check(body({ stage: "x".repeat(101) }))).not.toHaveLength(0);
  });

  it("rejects a score over 99", async () => {
    const matches = [{ aTeam: side(100), bTeam: side(0) }];
    expect(await check(body({ matches }))).not.toHaveLength(0);
  });

  it("rejects a stats list over 60", async () => {
    const stats = Array.from({ length: 61 }, (_, i) => [`m${i}`, {}]);
    const matches = [{ aTeam: { stats, score: 0 } }];
    expect(await check(body({ matches }))).not.toHaveLength(0);
  });
});
