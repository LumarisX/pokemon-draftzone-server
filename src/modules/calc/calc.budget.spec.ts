import { Test } from "@nestjs/testing";
import { CalcService } from "./calc.service";

describe("tier-3 compute budget", () => {
  let service: CalcService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CalcService],
    }).compile();
    service = moduleRef.get(CalcService);
  });

  const run = async (attacker: string, move: string) => {
    const started = Date.now();
    const result = await service.calculate({
      ruleset: "Gen9 NatDex",
      attacker: {
        species: attacker,
        level: 100,
        nature: "Adamant",
        evs: { atk: 252, spa: 252 },
        terastallized: false,
      },
      defender: {
        species: "Blissey",
        level: 100,
        evs: { hp: 252, def: 252 },
        terastallized: false,
      },
      move,
      field: { weather: "", terrain: "" },
      turns: 10,
      overrides: { hit: "roll", crit: "roll" },
    } as any);
    const elapsed = Date.now() - started;
    // eslint-disable-next-line no-console
    console.log(
      `${move.padEnd(18)} ${String(elapsed).padStart(6)}ms  unexpanded=${result.ko?.unexpanded}  ko=${result.ko?.summary}`,
    );
    return { result, elapsed };
  };

  it("resolves a cheap move fully", async () => {
    const { result, elapsed } = await run("Lucario", "Aura Sphere");
    expect(result.ko!.unexpanded).toBe(0);
    expect(elapsed).toBeLessThan(10000);
  }, 60000);

  it("returns promptly for a multi-hit move and says the projection is partial", async () => {
    const { result, elapsed } = await run("Cloyster", "Rock Blast");
    expect(result.supported).toBe(true);
    expect(result.ko!.unexpanded).toBeGreaterThan(0);
    expect(result.ko!.summary).toContain("budget");
    expect(elapsed).toBeLessThan(5000);
  }, 60000);

  it("returns promptly for a ten-hit move rather than hanging", async () => {
    const { result, elapsed } = await run("Maushold", "Population Bomb");
    expect(result.supported).toBe(true);
    expect(result.ko!.unexpanded).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5000);
  }, 60000);
});
