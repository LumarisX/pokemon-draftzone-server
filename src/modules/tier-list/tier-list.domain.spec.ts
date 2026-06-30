import {
  ClientTierInput,
  Tier,
  TierList,
  TierListPokemon,
  TierListPokemonAddon,
  UNTIERED_TIER_NAME,
} from "./tier-list.domain";

function buildTierList(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: "tierlist-1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map(),
    tiers: [],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

describe("TierList.canEdit", () => {
  it("returns false when sub is undefined", () => {
    const tierList = buildTierList();
    expect(tierList.canEdit(undefined)).toBe(false);
  });

  it("returns true for the creator", () => {
    const tierList = buildTierList({ createdBy: "auth0|owner" });
    expect(tierList.canEdit("auth0|owner")).toBe(true);
  });

  it("returns true for a collaborator", () => {
    const tierList = buildTierList({ collaborators: ["auth0|collab-1"] });
    expect(tierList.canEdit("auth0|collab-1")).toBe(true);
  });

  it("returns false for an unrelated user", () => {
    const tierList = buildTierList({ collaborators: ["auth0|collab-1"] });
    expect(tierList.canEdit("auth0|stranger")).toBe(false);
  });
});

describe("TierList.getTierByName", () => {
  it("returns the matching tier", () => {
    const tier = new Tier({ name: "S", cost: 30 });
    const tierList = buildTierList({ tiers: [tier] });

    expect(tierList.getTierByName("S")).toBe(tier);
  });

  it("returns undefined when no tier matches", () => {
    const tierList = buildTierList({ tiers: [] });

    expect(tierList.getTierByName("S")).toBeUndefined();
  });
});

describe("TierList.getPokemonIds", () => {
  it("returns the ids of every tracked Pokemon", () => {
    const pokemon = new Map([
      ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
      ["charizard", new TierListPokemon({ name: "Charizard", tier: "A" })],
    ]);
    const tierList = buildTierList({ pokemon });

    expect(tierList.getPokemonIds()).toEqual(["pikachu", "charizard"]);
  });
});

describe("TierList.getPokemonCost", () => {
  function tierListWithPikachu(pokemonOverrides: Partial<ConstructorParameters<typeof TierListPokemon>[0]> = {}) {
    return buildTierList({
      tiers: [new Tier({ name: "S", cost: 30 })],
      pokemon: new Map([
        [
          "pikachu",
          new TierListPokemon({
            name: "Pikachu",
            tier: "S",
            ...pokemonOverrides,
          }),
        ],
      ]),
    });
  }

  it("returns undefined for an untracked Pokemon", () => {
    const tierList = tierListWithPikachu();

    expect(tierList.getPokemonCost("notarealpokemon")).toBeUndefined();
  });

  it("returns the Pokemon's tier cost when no addon is requested", () => {
    const tierList = tierListWithPikachu();

    expect(tierList.getPokemonCost("pikachu")).toBe(30);
  });

  it("falls back to the tier cost when the Pokemon has no addons", () => {
    const tierList = tierListWithPikachu();

    expect(tierList.getPokemonCost("pikachu", ["Light Ball"])).toBe(30);
  });

  it("falls back to the tier cost when the requested addon name doesn't match any addon", () => {
    const tierList = tierListWithPikachu({
      addons: [new TierListPokemonAddon({ name: "Light Ball", cost: 5 })],
    });

    expect(tierList.getPokemonCost("pikachu", ["Some Other Addon"])).toBe(30);
  });

  it("returns the matching addon's cost when its name is first in addonNames", () => {
    const tierList = tierListWithPikachu({
      addons: [new TierListPokemonAddon({ name: "Light Ball", cost: 5 })],
    });

    expect(tierList.getPokemonCost("pikachu", ["Light Ball"])).toBe(5);
  });

  it("only ever checks the first entry of addonNames", () => {
    const tierList = tierListWithPikachu({
      addons: [new TierListPokemonAddon({ name: "Light Ball", cost: 5 })],
    });

    // "Light Ball" matches a real addon but isn't first, so it's never checked.
    expect(tierList.getPokemonCost("pikachu", ["Some Other Addon", "Light Ball"])).toBe(30);
  });

  it("returns undefined when the Pokemon's tier no longer exists", () => {
    const tierList = buildTierList({
      tiers: [],
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
      ]),
    });

    expect(tierList.getPokemonCost("pikachu")).toBeUndefined();
  });
});

describe("TierList.applyTierUpdate", () => {
  function buildClientTier(
    name: string,
    cost: number,
    pokemon: ClientTierInput["pokemon"] = [],
  ): ClientTierInput {
    return { name, cost, pokemon };
  }

  it("rebuilds the tier list, excluding any client-submitted 'Untiered' tier", () => {
    const tierList = buildTierList({ tiers: [] });

    tierList.applyTierUpdate([
      buildClientTier("S", 30),
      buildClientTier("Untiered", 0),
    ]);

    expect(tierList.tiers.map((t) => t.name)).toEqual(["S"]);
  });

  it("matches the Untiered tier name case-insensitively", () => {
    const tierList = buildTierList({ tiers: [] });

    tierList.applyTierUpdate([buildClientTier("S", 30), buildClientTier("UNTIERED", 0)]);

    expect(tierList.tiers.map((t) => t.name)).toEqual(["S"]);
  });

  it("preserves an existing tier's color and sets a new tier's color to undefined", () => {
    const tierList = buildTierList({
      tiers: [new Tier({ name: "S", cost: 30, color: "#ff0000" })],
    });

    tierList.applyTierUpdate([
      buildClientTier("S", 35),
      buildClientTier("A", 20),
    ]);

    expect(tierList.tiers).toEqual([
      new Tier({ name: "S", cost: 35, color: "#ff0000" }),
      new Tier({ name: "A", cost: 20, color: undefined }),
    ]);
  });

  it("assigns submitted Pokemon to their submitted tier, carrying over existing addons", () => {
    const addon = new TierListPokemonAddon({ name: "Light Ball", cost: 5 });
    const tierList = buildTierList({
      tiers: [new Tier({ name: "S", cost: 30 })],
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S", addons: [addon] })],
      ]),
    });

    tierList.applyTierUpdate([
      buildClientTier("S", 30, [{ id: "pikachu", name: "Pikachu", notes: "great pick" }]),
    ]);

    expect(tierList.pokemon.get("pikachu")).toEqual(
      new TierListPokemon({
        name: "Pikachu",
        tier: "S",
        notes: "great pick",
        addons: [addon],
        banned: undefined,
      }),
    );
  });

  it("drops any previously-tracked Pokemon that isn't present in the new submission at all", () => {
    const tierList = buildTierList({
      tiers: [new Tier({ name: "S", cost: 30 })],
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
      ]),
    });

    tierList.applyTierUpdate([buildClientTier("S", 30, [])]);

    expect(tierList.pokemon.size).toBe(0);
  });

  it("aggregates bannedAbilities across every tiered Pokemon, deduplicated", () => {
    const tierList = buildTierList({ tiers: [] });

    tierList.applyTierUpdate([
      buildClientTier("S", 30, [
        { id: "pikachu", name: "Pikachu", bannedAbilities: ["Static", "Lightning Rod"] },
      ]),
      buildClientTier("A", 20, [
        { id: "raichu", name: "Raichu", bannedAbilities: ["Static"] },
      ]),
    ]);

    expect(tierList.banned.abilities.sort()).toEqual(["Lightning Rod", "Static"].sort());
  });

  it("leaves banned.moves untouched", () => {
    const tierList = buildTierList({
      tiers: [],
      banned: { moves: ["Explosion"], abilities: [] },
    });

    tierList.applyTierUpdate([buildClientTier("S", 30, [])]);

    expect(tierList.banned.moves).toEqual(["Explosion"]);
  });

  describe("the Untiered bucket", () => {
    it("drops non-banned Untiered Pokemon entirely", () => {
      const tierList = buildTierList({ tiers: [] });

      tierList.applyTierUpdate([
        buildClientTier("Untiered", 0, [
          { id: "pikachu", name: "Pikachu", banned: false },
        ]),
      ]);

      expect(tierList.pokemon.size).toBe(0);
    });

    it("keeps a banned Untiered Pokemon, falling back to the literal 'Untiered' tier when it has no prior tier", () => {
      const tierList = buildTierList({ tiers: [] });

      tierList.applyTierUpdate([
        buildClientTier("Untiered", 0, [
          { id: "pikachu", name: "Pikachu", banned: true, notes: "too good" },
        ]),
      ]);

      expect(tierList.pokemon.get("pikachu")).toEqual(
        new TierListPokemon({
          name: "Pikachu",
          tier: UNTIERED_TIER_NAME,
          banned: true,
          notes: "too good",
          addons: undefined,
        }),
      );
    });

    it("keeps a banned Untiered Pokemon's last known real tier when it had one", () => {
      const tierList = buildTierList({
        tiers: [],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
        ]),
      });

      tierList.applyTierUpdate([
        buildClientTier("Untiered", 0, [
          { id: "pikachu", name: "Pikachu", banned: true },
        ]),
      ]);

      expect(tierList.pokemon.get("pikachu")?.tier).toBe("S");
      expect(tierList.pokemon.get("pikachu")?.banned).toBe(true);
    });

    it("merges Untiered bannedAbilities into the aggregate set alongside tiered ones", () => {
      const tierList = buildTierList({ tiers: [] });

      tierList.applyTierUpdate([
        buildClientTier("S", 30, [
          { id: "raichu", name: "Raichu", bannedAbilities: ["Static"] },
        ]),
        buildClientTier("Untiered", 0, [
          {
            id: "pikachu",
            name: "Pikachu",
            banned: true,
            bannedAbilities: ["Lightning Rod"],
          },
        ]),
      ]);

      expect(tierList.banned.abilities.sort()).toEqual(["Lightning Rod", "Static"].sort());
    });

    it("does nothing when the client payload has no Untiered tier at all", () => {
      const tierList = buildTierList({ tiers: [] });

      expect(() =>
        tierList.applyTierUpdate([buildClientTier("S", 30, [])]),
      ).not.toThrow();
      expect(tierList.pokemon.size).toBe(0);
    });
  });
});
