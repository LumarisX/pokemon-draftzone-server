import { tierId } from "./tier-list.test-ids";
import {
  diffStates,
  mergeStates,
  summarizeChanges,
  TierListState,
} from "./tier-list.state";

function state(overrides: Partial<TierListState> = {}): TierListState {
  return {
    tiers: [
      { id: tierId("S"), name: "S", cost: 20 },
      { id: tierId("A"), name: "A", cost: 15 },
    ],
    pokemon: {
      garchomp: { name: "Garchomp", tierId: tierId("S") },
      rotomwash: { name: "Rotom-Wash", tierId: tierId("A") },
    },
    banned: { moves: [], abilities: [] },
    ...overrides,
  };
}

describe("diffStates", () => {
  it("reports nothing for identical lists", () => {
    expect(diffStates(state(), state())).toEqual([]);
  });

  it("reports moves with both tier names and costs", () => {
    const after = state();
    after.pokemon.rotomwash = { name: "Rotom-Wash", tierId: tierId("S") };

    expect(diffStates(state(), after)).toEqual([
      {
        kind: "moved",
        pokemonId: "rotomwash",
        name: "Rotom-Wash",
        from: "A",
        to: "S",
        fromCost: 15,
        toCost: 20,
      },
    ]);
  });

  it("reports repriced and renamed tiers", () => {
    const after = state({
      tiers: [
        { id: tierId("S"), name: "S+", cost: 22 },
        { id: tierId("A"), name: "A", cost: 15 },
      ],
    });

    expect(diffStates(state(), after)).toEqual([
      { kind: "tier-renamed", tierId: tierId("S"), from: "S", to: "S+" },
      { kind: "tier-repriced", tierId: tierId("S"), name: "S+", from: 20, to: 22 },
    ]);
  });

  it("matches tiers by name across two different lists", () => {
    const other = state({
      tiers: [
        { id: tierId("X"), name: "S", cost: 20 },
        { id: tierId("Y"), name: "A", cost: 15 },
      ],
      pokemon: {
        garchomp: { name: "Garchomp", tierId: tierId("X") },
        rotomwash: { name: "Rotom-Wash", tierId: tierId("Y") },
      },
    });

    expect(diffStates(state(), other)).toEqual([]);
  });

  it("ignores Pokémon that were tracked but never placed", () => {
    const after = state();
    after.pokemon.pikachu = { name: "Pikachu" };

    expect(diffStates(state(), after)).toEqual([]);
  });

  it("reports bans and added or removed Pokémon", () => {
    const after = state();
    after.pokemon.garchomp = { ...after.pokemon.garchomp, banned: true };
    after.pokemon.kingambit = { name: "Kingambit", tierId: tierId("S") };
    delete after.pokemon.rotomwash;
    after.banned.moves = ["shellsmash"];

    const changes = diffStates(state(), after);

    expect(changes).toEqual(
      expect.arrayContaining([
        { kind: "banned", pokemonId: "garchomp", name: "Garchomp" },
        { kind: "added", pokemonId: "kingambit", name: "Kingambit", tier: "S", cost: 20 },
        { kind: "removed", pokemonId: "rotomwash", name: "Rotom-Wash", tier: "A", cost: 15 },
        { kind: "ban-list", field: "moves", added: ["shellsmash"], removed: [] },
      ]),
    );
    expect(summarizeChanges(changes)).toBe(
      "Added 1 Pokémon, removed 1 Pokémon, banned 1, changed banned moves or abilities",
    );
  });
});

describe("mergeStates", () => {
  it("applies the source's changes where the copy kept the original", () => {
    const base = state();
    const source = state();
    source.pokemon.rotomwash = { name: "Rotom-Wash", tierId: tierId("S") };
    source.tiers[1] = { ...source.tiers[1], cost: 14 };
    const current = state();

    const result = mergeStates(base, source, current);

    expect(result.conflicts).toEqual([]);
    expect(result.state.pokemon.rotomwash.tierId).toBe(tierId("S"));
    expect(result.state.tiers.find((tier) => tier.name === "A")?.cost).toBe(14);
  });

  it("keeps the copy's own edits that the source didn't touch", () => {
    const base = state();
    const source = state();
    source.pokemon.rotomwash = { name: "Rotom-Wash", tierId: tierId("S") };
    const current = state();
    current.pokemon.garchomp = { name: "Garchomp", tierId: tierId("A") };

    const result = mergeStates(base, source, current);

    expect(result.state.pokemon.garchomp.tierId).toBe(tierId("A"));
    expect(result.state.pokemon.rotomwash.tierId).toBe(tierId("S"));
  });

  it("asks which version wins when both changed the same Pokémon", () => {
    const base = state();
    const source = state();
    source.pokemon.garchomp = { name: "Garchomp", tierId: tierId("A") };
    const current = state();
    current.pokemon.garchomp = { name: "Garchomp", banned: true, tierId: tierId("S") };

    const conflicted = mergeStates(base, source, current);
    expect(conflicted.conflicts.map((conflict) => conflict.pokemonId)).toEqual([
      "garchomp",
    ]);
    expect(conflicted.state.pokemon.garchomp).toEqual(current.pokemon.garchomp);

    const resolved = mergeStates(base, source, current, { garchomp: "source" });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.state.pokemon.garchomp).toEqual({
      name: "Garchomp",
      tierId: tierId("A"),
    });
  });

  it("keeps the copy's price for a tier the organizer repriced", () => {
    const base = state();
    const source = state();
    source.tiers[0] = { ...source.tiers[0], cost: 25 };
    const current = state();
    current.tiers[0] = { ...current.tiers[0], cost: 18 };

    expect(mergeStates(base, source, current).state.tiers[0].cost).toBe(18);
  });

  it("adds a new source tier and places its Pokémon in it", () => {
    const base = state();
    const source = state();
    source.tiers.push({ id: tierId("B"), name: "B", cost: 10 });
    source.pokemon.pikachu = { name: "Pikachu", tierId: tierId("B") };
    const current = state();

    const result = mergeStates(base, source, current);
    const added = result.state.tiers.find((tier) => tier.name === "B")!;

    expect(added).toBeDefined();
    expect(result.state.pokemon.pikachu.tierId).toBe(added.id);
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "tier-added", name: "B" }),
        expect.objectContaining({ kind: "added", pokemonId: "pikachu", tier: "B" }),
      ]),
    );
  });

  it("makes the copy match the source when there is no record of the original", () => {
    const source = state();
    source.pokemon.rotomwash = { name: "Rotom-Wash", tierId: tierId("S") };
    const current = state();
    current.pokemon.pikachu = { name: "Pikachu", tierId: tierId("A") };

    const result = mergeStates(null, source, current);

    expect(result.conflicts).toEqual([]);
    expect(result.state.pokemon.pikachu).toBeUndefined();
    expect(result.state.pokemon.rotomwash.tierId).toBe(tierId("S"));
  });

  it("does not modify the states it was given", () => {
    const base = state();
    const source = state();
    source.pokemon.garchomp = { name: "Garchomp", tierId: tierId("A") };
    const current = state();
    const snapshot = JSON.stringify(current);

    mergeStates(base, source, current);

    expect(JSON.stringify(current)).toBe(snapshot);
  });
});
