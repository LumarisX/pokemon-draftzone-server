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

  it("includes each Pokemon's abilities, baseStats, bst, scores, types, and index in team order", () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const result = summarizeTeam([pikachu, charizard]);

    expect(result.team).toHaveLength(2);
    expect(result.team[0]).toMatchObject({
      id: "pikachu",
      abilities: pikachu.getAbilities(),
      baseStats: pikachu.baseStats,
      bst: pikachu.bst,
      scores: pikachu.scores,
      types: pikachu.types,
      index: 0,
    });
    expect(result.team[1]).toMatchObject({ id: "charizard", index: 1 });
  });

  it("computes mean/median/min/max across the base stats and bst for an odd-sized team", () => {
    const result = summarizeTeam([mon("pikachu"), mon("charizard"), mon("mew")]);

    expect(result.stats).toMatchObject({
      mean: { hp: 71, atk: 80, def: 73, spa: 86, spd: 78, spe: 97, bst: 485 },
      median: { hp: 78, atk: 84, def: 78, spa: 100, spd: 85, spe: 100, bst: 534 },
      min: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90, bst: 320 },
      max: { hp: 100, atk: 100, def: 100, spa: 109, spd: 100, spe: 100, bst: 600 },
    });
  });

  it("aggregates each score across the team", () => {
    const team = [mon("pikachu"), mon("charizard"), mon("mew")];
    const overall = team.map((pokemon) => pokemon.scores.overall);

    const result = summarizeTeam(team);

    expect(result.stats!.max.overall).toBe(Math.max(...overall));
    expect(result.stats!.min.overall).toBe(Math.min(...overall));
    expect(result.stats!.mean.power).toBeCloseTo(
      team.reduce((sum, pokemon) => sum + pokemon.scores.power, 0) / 3,
      3,
    );
  });

  it("averages the two middle values for an even-sized team's median", () => {
    const result = summarizeTeam([mon("pikachu"), mon("charizard")]);

    expect(result.stats!.median.hp).toBe(Math.round((35 + 78) / 2));
    expect(result.stats!.mean.hp).toBe(Math.round((35 + 78) / 2));
  });

  it("leaves stats undefined for an empty team", () => {
    const result = summarizeTeam([]);

    expect(result.stats).toBeUndefined();
    expect(result.team).toEqual([]);
  });

  it("computes abilities, baseStats, bst, scores, and types for each draft forme", () => {
    const pikachu = new PDZPokemon(
      { id: "pikachu", draftFormes: ["raichu" as any] },
      NAT_DEX,
    );
    const raichu = mon("raichu");

    const result = summarizeTeam([pikachu]);

    expect(result.team[0].draftFormes).toEqual([
      {
        id: "raichu",
        name: raichu.name,
        types: raichu.types,
        abilities: raichu.getAbilities(),
        baseStats: raichu.baseStats,
        bst: raichu.bst,
        scores: raichu.scores,
      },
    ]);
  });

  it("uses the given scorer for the team, its formes and the aggregates", () => {
    const fixed = { power: 1, bulk: 2, speed: 3, overall: 4 };
    const pikachu = new PDZPokemon(
      { id: "pikachu", draftFormes: ["raichu" as any] },
      NAT_DEX,
    );

    const result = summarizeTeam([pikachu], undefined, undefined, () => fixed);

    expect(result.team[0].scores).toEqual(fixed);
    expect(result.team[0].draftFormes?.[0]).toMatchObject({ scores: fixed });
    expect(result.stats!.max.overall).toBe(4);
  });

  it("falls back to the bare id when a draft forme can't be resolved", () => {
    const pikachu = new PDZPokemon(
      { id: "pikachu", draftFormes: ["not-a-real-pokemon" as any] },
      NAT_DEX,
    );

    const result = summarizeTeam([pikachu]);

    expect(result.team[0].draftFormes).toEqual([
      { id: "not-a-real-pokemon", name: "not-a-real-pokemon" },
    ]);
  });
});
