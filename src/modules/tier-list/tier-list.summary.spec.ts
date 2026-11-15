jest.mock("@core/data/rulesets/rulesets", () => ({ getRuleset: jest.fn() }));

import { Tier, TierList, TierListPokemon } from "./tier-list.domain";
import { summarizePokemon } from "./tier-list.repository";

function tierList(pokemon: [string, TierListPokemon][], tiers: Tier[]) {
  return { pokemon: new Map(pokemon), tiers } as unknown as TierList;
}

describe("summarizePokemon", () => {
  const s = new Tier({ id: "s", name: "S", cost: 10 });
  const s2 = new Tier({ id: "s2", name: "S2", cost: 10 });
  const a = new Tier({ id: "a", name: "A", cost: 5 });

  it("counts tiered, unbanned Pokémon and lists the first tier with the top cost", () => {
    const summary = summarizePokemon(
      tierList(
        [
          ["mewtwo", new TierListPokemon({ name: "Mewtwo", tierId: "s" })],
          ["arceus", new TierListPokemon({ name: "Arceus", tierId: "s", banned: true })],
          ["zekrom", new TierListPokemon({ name: "Zekrom", tierId: "s2" })],
          ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: "a" })],
          ["magikarp", new TierListPokemon({ name: "Magikarp" })],
        ],
        [a, s, s2],
      ),
    );

    expect(summary.pokemonCount).toBe(3);
    expect(summary.topPokemon).toEqual([{ id: "mewtwo", name: "Mewtwo" }]);
  });

  it("lists at most eight, in tier list order", () => {
    const names = Array.from({ length: 10 }, (_, i) => `mon${i}`);
    const summary = summarizePokemon(
      tierList(
        names.map((id) => [id, new TierListPokemon({ name: id, tierId: "s" })]),
        [s],
      ),
    );

    expect(summary.topPokemon.map((p) => p.id)).toEqual(names.slice(0, 8));
  });

  it("has no top Pokémon without tiers", () => {
    expect(summarizePokemon(tierList([], [])).topPokemon).toEqual([]);
  });
});
