import { Rulesets } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { getMatchupCoverage, getTeamCoverage } from "./coverage";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;

function mon(id: string) {
  return new PDZPokemon({ id }, NAT_DEX);
}

/** The sort comparator in getMatchupCoverage groups all STAB moves before
 * non-STAB moves (regardless of power), then orders each group by descending
 * effective power. */
function expectSortedByStabThenEPower(moves: { stab?: true; ePower: number }[]) {
  const firstNonStabIndex = moves.findIndex((m) => !m.stab);
  const stabMoves = firstNonStabIndex === -1 ? moves : moves.slice(0, firstNonStabIndex);
  const restMoves = firstNonStabIndex === -1 ? [] : moves.slice(firstNonStabIndex);

  expect(stabMoves.every((m) => m.stab)).toBe(true);
  expect(restMoves.every((m) => !m.stab)).toBe(true);
  for (const group of [stabMoves, restMoves]) {
    for (let i = 1; i < group.length; i++) {
      expect(group[i - 1].ePower).toBeGreaterThanOrEqual(group[i].ePower);
    }
  }
}

describe("getMatchupCoverage", () => {
  it("merges each attacker's client payload with its best-coverage moves against the opposing team", async () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const [result] = await getMatchupCoverage([pikachu], [charizard]);

    expect(result.id).toBe("pikachu");
    expect(result.coverage.physical.length).toBeGreaterThan(0);
  });

  it("sorts each attacker's physical and special coverage with STAB moves prioritized over raw power", async () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const [result] = await getMatchupCoverage([pikachu], [charizard]);

    expectSortedByStabThenEPower(result.coverage.physical);
    expectSortedByStabThenEPower(result.coverage.special);
  });

  it("puts Pikachu's STAB Volt Tackle ahead of higher-ePower non-STAB moves", async () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const [result] = await getMatchupCoverage([pikachu], [charizard]);

    const voltTackleIndex = result.coverage.physical.findIndex(
      (m: any) => m.id === "volttackle",
    );
    const lastResortIndex = result.coverage.physical.findIndex(
      (m: any) => m.id === "lastresort",
    );
    // Last Resort has higher ePower than Volt Tackle but isn't STAB for Pikachu.
    expect(voltTackleIndex).toBeGreaterThanOrEqual(0);
    expect(lastResortIndex).toBeGreaterThanOrEqual(0);
    expect(voltTackleIndex).toBeLessThan(lastResortIndex);
  });
});

describe("getTeamCoverage", () => {
  it("includes each Pokemon's id, coverage, and fullcoverage", async () => {
    const pikachu = mon("pikachu");

    const result = await getTeamCoverage([pikachu]);

    expect(result.team).toHaveLength(1);
    expect(result.team[0].id).toBe("pikachu");
    expect(result.team[0].coverage).toEqual(await pikachu.coverage());
    expect(result.team[0].fullcoverage).toEqual(await pikachu.fullcoverage());
  });

  it("counts, per type and category, how many teammates have at least one move of that type", async () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const result = await getTeamCoverage([pikachu, charizard]);

    const pikachuFull = await pikachu.fullcoverage();
    const charizardFull = await charizard.fullcoverage();
    const expectedNormalPhysicalCount = [pikachuFull, charizardFull].filter(
      (fc) => "Normal" in fc.physical,
    ).length;

    const normalPhysicalEntry = result.max.find(
      (m) => m.type === "Normal" && m.category === "physical",
    );
    expect(normalPhysicalEntry?.value).toBe(expectedNormalPhysicalCount);
  });

  it("returns an empty max array for an empty team", async () => {
    const result = await getTeamCoverage([]);

    expect(result.team).toEqual([]);
    expect(result.max).toEqual([]);
  });
});
