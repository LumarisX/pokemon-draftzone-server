import { Types } from "mongoose";
import {
  Tier,
  TierList,
  TierListPokemon,
  TierListPokemonAddon,
  TierListSettings,
} from "./tier-list.domain";
import { TierListMapper } from "./tier-list.mapper";
import { TierListDocument } from "./tier-list.schema";

function buildDoc(overrides: Record<string, unknown> = {}): TierListDocument {
  return {
    _id: new Types.ObjectId(),
    name: "Spring Tier List",
    description: "A spring tier list",
    createdBy: "auth0|owner",
    copiedFrom: undefined,
    pokemon: new Map([
      [
        "pikachu",
        {
          name: "Pikachu",
          tier: "S",
          notes: "great pick",
          banned: false,
          addons: [{ name: "Light Ball", cost: 5, notes: "boosts power" }],
        },
      ],
    ]),
    tiers: [{ name: "S", cost: 30, color: "#ff0000" }],
    banned: { moves: ["Explosion"], abilities: ["Static"] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true, shareToken: "token-123" },
    collaborators: ["auth0|collab-1"],
    ...overrides,
  } as unknown as TierListDocument;
}

describe("TierListMapper.fromDatabase", () => {
  it("maps top-level fields, converting ids to strings", () => {
    const doc = buildDoc();

    const result = TierListMapper.fromDatabase(doc);

    expect(result).toBeInstanceOf(TierList);
    expect(result.id).toBe(doc._id.toString());
    expect(result.name).toBe("Spring Tier List");
    expect(result.description).toBe("A spring tier list");
    expect(result.createdBy).toBe("auth0|owner");
    expect(result.format.name).toBe("Singles");
    expect(result.ruleset.name).toBe("Gen9 NatDex");
  });

  it("converts copiedFrom to a string when present, and leaves it undefined otherwise", () => {
    const copiedFromId = new Types.ObjectId();
    const withCopiedFrom = TierListMapper.fromDatabase(
      buildDoc({ copiedFrom: copiedFromId }),
    );
    const withoutCopiedFrom = TierListMapper.fromDatabase(buildDoc());

    expect(withCopiedFrom.copiedFrom).toBe(copiedFromId.toString());
    expect(withoutCopiedFrom.copiedFrom).toBeUndefined();
  });

  it("maps the pokemon map, including nested addons", () => {
    const result = TierListMapper.fromDatabase(buildDoc());

    expect(result.pokemon.get("pikachu")).toEqual(
      new TierListPokemon({
        name: "Pikachu",
        tier: "S",
        notes: "great pick",
        banned: false,
        addons: [
          new TierListPokemonAddon({
            name: "Light Ball",
            cost: 5,
            notes: "boosts power",
          }),
        ],
      }),
    );
  });

  it("maps tiers", () => {
    const result = TierListMapper.fromDatabase(buildDoc());

    expect(result.tiers).toEqual([new Tier({ name: "S", cost: 30, color: "#ff0000" })]);
  });

  it("copies the banned moves/abilities arrays (not by reference)", () => {
    const doc = buildDoc();
    const result = TierListMapper.fromDatabase(doc);

    expect(result.banned).toEqual({ moves: ["Explosion"], abilities: ["Static"] });
    expect(result.banned.moves).not.toBe(doc.banned.moves);
    expect(result.banned.abilities).not.toBe(doc.banned.abilities);
  });

  it("maps settings", () => {
    const result = TierListMapper.fromDatabase(buildDoc());

    expect(result.settings).toEqual(
      new TierListSettings({ isPublic: true, shareToken: "token-123" }),
    );
  });

  it("copies the collaborators array (not by reference)", () => {
    const doc = buildDoc();
    const result = TierListMapper.fromDatabase(doc);

    expect(result.collaborators).toEqual(["auth0|collab-1"]);
    expect(result.collaborators).not.toBe(doc.collaborators);
  });
});

describe("TierListMapper.toSettingsPayload", () => {
  it("exposes only name/description", () => {
    const tierList = TierListMapper.fromDatabase(buildDoc());

    expect(TierListMapper.toSettingsPayload(tierList)).toEqual({
      name: "Spring Tier List",
      description: "A spring tier list",
    });
  });
});

describe("TierListMapper.toTierEntities", () => {
  it("maps domain Tiers to their persisted shape", () => {
    const tiers = [new Tier({ name: "S", cost: 30, color: "#ff0000" })];

    expect(TierListMapper.toTierEntities(tiers)).toEqual([
      { name: "S", cost: 30, color: "#ff0000" },
    ]);
  });
});

describe("TierListMapper.toPokemonEntityMap", () => {
  it("maps domain TierListPokemon entries to their persisted shape, including addons", () => {
    const pokemon = new Map([
      [
        "pikachu",
        new TierListPokemon({
          name: "Pikachu",
          tier: "S",
          notes: "great pick",
          banned: true,
          addons: [new TierListPokemonAddon({ name: "Light Ball", cost: 5 })],
        }),
      ],
    ]);

    const result = TierListMapper.toPokemonEntityMap(pokemon);

    expect(result.get("pikachu")).toEqual({
      name: "Pikachu",
      tier: "S",
      notes: "great pick",
      banned: true,
      addons: [{ name: "Light Ball", cost: 5, notes: undefined }],
    });
  });

  it("returns an empty map for an empty input", () => {
    expect(TierListMapper.toPokemonEntityMap(new Map()).size).toBe(0);
  });
});
