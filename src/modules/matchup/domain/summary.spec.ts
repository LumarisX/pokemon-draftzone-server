import { Rulesets } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { summarizeTeam } from "./summary";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;

function mon(id: string) {
  return new PDZPokemon({ id }, NAT_DEX);
}

describe("summarizeTeam", () => {
  it("carries over the team name and coach", () => {
    const result = summarizeTeam([mon("pikachu")], "Team Rocket", "Giovanni");

    expect(result.teamName).toBe("Team Rocket");
    expect(result.coach).toBe("Giovanni");
  });

  it("includes each Pokemon's abilities, baseStats, bst, cst, types, and index in team order", () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const result = summarizeTeam([pikachu, charizard]);

    expect(result.team).toHaveLength(2);
    expect(result.team[0]).toMatchObject({
      id: "pikachu",
      abilities: pikachu.getAbilities(),
      baseStats: pikachu.baseStats,
      bst: pikachu.bst,
      cst: pikachu.cst,
      types: pikachu.types,
      index: 0,
    });
    expect(result.team[1]).toMatchObject({ id: "charizard", index: 1 });
  });

  it("computes mean/median/min/max across hp/atk/def/spa/spd/spe/bst/cst for an odd-sized team", () => {
    // Pikachu hp 35, Charizard hp 78, Mew hp 100 -> sorted [35, 78, 100].
    const result = summarizeTeam([mon("pikachu"), mon("charizard"), mon("mew")]);

    expect(result.stats).toEqual({
      mean: { hp: 71, atk: 80, def: 73, spa: 86, spd: 78, spe: 97, bst: 485, cst: 486 },
      median: { hp: 78, atk: 84, def: 78, spa: 100, spd: 85, spe: 100, bst: 534, cst: 537 },
      min: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90, bst: 320, cst: 320 },
      max: { hp: 100, atk: 100, def: 100, spa: 109, spd: 100, spe: 100, bst: 600, cst: 600 },
    });
  });

  it("averages the two middle values for an even-sized team's median", () => {
    // hp values [35 (Pikachu), 78 (Charizard)] sorted -> median is their average.
    const result = summarizeTeam([mon("pikachu"), mon("charizard")]);

    expect(result.stats!.median.hp).toBe(Math.round((35 + 78) / 2));
    expect(result.stats!.mean.hp).toBe(Math.round((35 + 78) / 2));
  });

  it("leaves stats undefined for an empty team", () => {
    const result = summarizeTeam([]);

    expect(result.stats).toBeUndefined();
    expect(result.team).toEqual([]);
  });
});
