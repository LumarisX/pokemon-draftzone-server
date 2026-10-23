import {
  ClientTierInput,
  Tier,
  TierList,
  TierListPokemon,
  TierListPokemonAddon,
  UNTIERED_TIER_NAME,
  upstreamOf,
} from "./tier-list.domain";
import { tierId } from "./tier-list.test-ids";

function buildTierList(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: "tierlist-1",
    slug: "tierlist1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map(),
    tiers: [],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    visibility: "public",
    ...overrides,
  });
}

describe("TierList.presetAccess", () => {
  it("lets anyone view a public list but not edit it", () => {
    const tierList = buildTierList();
    expect(tierList.presetAccess(undefined)).toBe("view");
    expect(tierList.presetAccess("auth0|stranger")).toBe("view");
  });

  it("gives the creator manage access", () => {
    const tierList = buildTierList({ createdBy: "auth0|owner" });
    expect(tierList.presetAccess("auth0|owner")).toBe("manage");
  });

  it("gives editors edit access and viewers view access", () => {
    const tierList = buildTierList({
      visibility: "private",
      members: [
        { sub: "auth0|editor", role: "editor" },
        { sub: "auth0|viewer", role: "viewer" },
      ],
    });
    expect(tierList.presetAccess("auth0|editor")).toBe("edit");
    expect(tierList.presetAccess("auth0|viewer")).toBe("view");
  });

  it("hides a private list from strangers", () => {
    const tierList = buildTierList({ visibility: "private" });
    expect(tierList.presetAccess(undefined)).toBe("none");
    expect(tierList.presetAccess("auth0|stranger")).toBe("none");
  });

  it("lets anyone with the link view an unlisted list", () => {
    const tierList = buildTierList({ visibility: "unlisted" });
    expect(tierList.presetAccess("auth0|stranger")).toBe("view");
  });
});

describe("upstreamOf", () => {
  it("points a preset's copies at the preset itself", () => {
    expect(upstreamOf({ id: "a", version: 4 })).toEqual({ id: "a", version: 4 });
  });

  it("points a copy of a tournament copy at that copy's own source", () => {
    expect(
      upstreamOf({
        id: "copy",
        version: 9,
        tournamentId: "t",
        copiedFrom: "preset",
        copiedFromVersion: 2,
      }),
    ).toEqual({ id: "preset", version: 2 });
  });

  it("falls back to the tournament copy when it has no source", () => {
    expect(upstreamOf({ id: "copy", version: 9, tournamentId: "t" })).toEqual({
      id: "copy",
      version: 9,
    });
  });
});

describe("TierList.getTierByName", () => {
  it("returns the matching tier", () => {
    const tier = new Tier({ id: tierId("S"), name: "S", cost: 30 });
    const tierList = buildTierList({ tiers: [tier] });

    expect(tierList.getTierById(tierId("S"))).toBe(tier);
  });

  it("returns undefined when no tier matches", () => {
    const tierList = buildTierList({ tiers: [] });

    expect(tierList.getTierById(tierId("S"))).toBeUndefined();
  });
});

describe("TierList.getPokemonIds", () => {
  it("returns the ids of every tracked Pokemon", () => {
    const pokemon = new Map([
      ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
      ["charizard", new TierListPokemon({ name: "Charizard", tierId: tierId("A") })],
    ]);
    const tierList = buildTierList({ pokemon });

    expect(tierList.getPokemonIds()).toEqual(["pikachu", "charizard"]);
  });
});

describe("TierList.getPokemonCost", () => {
  function tierListWithPikachu(pokemonOverrides: Partial<ConstructorParameters<typeof TierListPokemon>[0]> = {}) {
    return buildTierList({
      tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
      pokemon: new Map([
        [
          "pikachu",
          new TierListPokemon({
            name: "Pikachu",
            tierId: tierId("S"),
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

    expect(tierList.getPokemonCost("pikachu", ["Some Other Addon", "Light Ball"])).toBe(30);
  });

  it("returns undefined when the Pokemon's tier no longer exists", () => {
    const tierList = buildTierList({
      tiers: [],
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
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
    return { id: tierId(name), name, cost, pokemon };
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
      tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30, color: "#ff0000" })],
    });

    tierList.applyTierUpdate([
      buildClientTier("S", 35),
      buildClientTier("A", 20),
    ]);

    expect(
      tierList.tiers.map((t) => ({
        name: t.name,
        cost: t.cost,
        color: t.color,
      })),
    ).toEqual([
      { name: "S", cost: 35, color: "#ff0000" },
      { name: "A", cost: 20, color: undefined },
    ]);
  });

  it("assigns submitted Pokemon to their submitted tier, carrying over existing addons", () => {
    const addon = new TierListPokemonAddon({ name: "Light Ball", cost: 5 });
    const tierList = buildTierList({
      tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S"), addons: [addon] })],
      ]),
    });

    tierList.applyTierUpdate([
      buildClientTier("S", 30, [{ id: "pikachu", name: "Pikachu", notes: "great pick" }]),
    ]);

    expect(tierList.pokemon.get("pikachu")).toEqual(
      new TierListPokemon({
        name: "Pikachu",
        tierId: tierId("S"),
        notes: "great pick",
        addons: [addon],
        banned: undefined,
      }),
    );
  });

  it("drops any previously-tracked Pokemon that isn't present in the new submission at all", () => {
    const tierList = buildTierList({
      tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
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
          tierId: undefined,
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
          ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
        ]),
      });

      tierList.applyTierUpdate([
        buildClientTier("Untiered", 0, [
          { id: "pikachu", name: "Pikachu", banned: true },
        ]),
      ]);

      expect(tierList.pokemon.get("pikachu")?.tierId).toBe(tierId("S"));
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

  describe("legal formes", () => {
    it("stores the formes submitted for a tiered pokemon", () => {
      const tierList = buildTierList({ tiers: [] });

      tierList.applyTierUpdate([
        buildClientTier("S", 30, [
          {
            id: "charizard",
            name: "Charizard",
            formes: ["charizardmegax", "charizardmegay"],
          },
        ]),
      ]);

      expect(tierList.pokemon.get("charizard")?.formes).toEqual([
        "charizardmegax",
        "charizardmegay",
      ]);
    });

    it("clears stored formes when the client submits none", () => {
      const tierList = buildTierList({
        tiers: [],
        pokemon: new Map([
          [
            "charizard",
            new TierListPokemon({
              name: "Charizard",
              tierId: tierId("S"),
              formes: ["charizardmegax"],
            }),
          ],
        ]),
      });

      tierList.applyTierUpdate([
        buildClientTier("S", 30, [{ id: "charizard", name: "Charizard", formes: [] }]),
      ]);

      expect(tierList.pokemon.get("charizard")?.formes).toBeUndefined();
    });

    it("keeps formes on a banned pokemon submitted through Untiered", () => {
      const tierList = buildTierList({ tiers: [] });

      tierList.applyTierUpdate([
        buildClientTier("Untiered", 0, [
          {
            id: "charizard",
            name: "Charizard",
            banned: true,
            formes: ["charizardmegax"],
          },
        ]),
      ]);

      expect(tierList.pokemon.get("charizard")?.formes).toEqual(["charizardmegax"]);
    });
  });
});
