import { Rulesets } from "@core/data/rulesets/rulesets";
import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";
import { ID } from "@pkmn/data";
import { PokemonDataMapper } from "./pokemon-data.mapper";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;

function mon(id: string) {
  return new DraftPokemon(id as ID, NAT_DEX);
}

describe("PokemonDataMapper.toDto", () => {
  it("maps a standard species' identity, typing, and stat fields", async () => {
    const pikachu = mon("pikachu");

    const dto = await PokemonDataMapper.toDto(pikachu);

    expect(dto).toMatchObject({
      id: "pikachu",
      name: "Pikachu",
      baseSpecies: "Pikachu",
      gen: pikachu.gen,
      isNonstandard: "",
      types: ["Electric"],
      abilities: ["Static", "Lightning Rod"],
      num: 25,
      eggGroups: ["Field", "Fairy"],
      prevo: "Pichu",
      evos: ["Raichu", "Raichu-Alola"],
      nfe: true,
      evolved: false,
      tags: [],
    });
    expect(dto.baseStats).toEqual(pikachu.baseStats);
    expect(dto.hp).toBe(pikachu.baseStats.hp);
    expect(dto.atk).toBe(pikachu.baseStats.atk);
    expect(dto.def).toBe(pikachu.baseStats.def);
    expect(dto.spa).toBe(pikachu.baseStats.spa);
    expect(dto.spd).toBe(pikachu.baseStats.spd);
    expect(dto.spe).toBe(pikachu.baseStats.spe);
    expect(dto.bst).toBe(pikachu.bst);
    expect(dto.cst).toBe(pikachu.cst);
  });

  it("computes evolved as the inverse of nfe", async () => {
    const raichu = await PokemonDataMapper.toDto(mon("raichu"));

    expect(raichu.nfe).toBe(false);
    expect(raichu.evolved).toBe(true);
  });

  it("falls back to empty strings/arrays for unset optional fields", async () => {
    const pikachu = await PokemonDataMapper.toDto(mon("pikachu"));

    expect(pikachu.requiredAbility).toBe("");
    expect(pikachu.requiredMove).toBe("");
    expect(pikachu.requiredItem).toBeUndefined();
  });

  it("wraps a single requiredItem in an array", async () => {
    const megaCharizardX = await PokemonDataMapper.toDto(mon("charizardmegax"));

    expect(megaCharizardX.requiredItem).toEqual(["Charizardite X"]);
    expect(megaCharizardX.baseSpecies).toBe("Charizard");
    expect(megaCharizardX.isMega).toBe(true);
  });

  it("passes requiredItems through as-is when there's no single requiredItem", async () => {
    const arceusBug = await PokemonDataMapper.toDto(mon("arceusbug"));

    expect(arceusBug.requiredItem).toEqual(["Insect Plate", "Buginium Z"]);
  });

  it("flags isPrimal for a Primal Reversion forme", async () => {
    const kyogrePrimal = await PokemonDataMapper.toDto(mon("kyogreprimal"));

    expect(kyogrePrimal.isPrimal).toBe(true);
    expect(kyogrePrimal.requiredItem).toEqual(["Blue Orb"]);
  });

  it("carries over a species' tags (e.g. Sub-Legendary)", async () => {
    const articuno = await PokemonDataMapper.toDto(mon("articuno"));

    expect(articuno.tags).toEqual(["Sub-Legendary"]);
  });

  it("dedupes coverage move types across physical and special categories", async () => {
    const pikachu = await PokemonDataMapper.toDto(mon("pikachu"));

    expect(Array.isArray(pikachu.coverage)).toBe(true);
    expect(new Set(pikachu.coverage).size).toBe(pikachu.coverage.length);
  });

  it("returns an empty coverage list for a Pokemon with no damaging moves (Ditto)", async () => {
    const ditto = await PokemonDataMapper.toDto(mon("ditto"));

    expect(ditto.coverage).toEqual([]);
  });

  it("includes the names of every move in the Pokemon's learnset", async () => {
    const pikachu = await PokemonDataMapper.toDto(mon("pikachu"));

    expect(pikachu.learns).toContain("Thunderbolt");
    expect(pikachu.learns.length).toBeGreaterThan(0);
  });

  describe("BUG: isGigantamax always reports false", () => {
    it("reports false even for a species that can actually Gigantamax", async () => {
      // PokemonDataMapper reads `specie.isGigantamax`, but the real field
      // (from @pkmn/data) is `canGigantamax` (which holds the G-Max move
      // name, e.g. "G-Max Vine Lash"). `isGigantamax` is never set, so
      // `Boolean(specie.isGigantamax)` is always false.
      const venusaur = mon("venusaur");
      expect(venusaur.canGigantamax).toBe("G-Max Vine Lash");

      const dto = await PokemonDataMapper.toDto(venusaur);

      expect(dto.isGigantamax).toBe(false);
    });
  });

  it("labels sandstorm immunity (e.g. from Sand Veil) as 'Sandstorm'", async () => {
    const cacturne = mon("cacturne");
    expect(cacturne.abilities).toMatchObject({ 0: "Sand Veil" });

    const dto = await PokemonDataMapper.toDto(cacturne);

    expect(dto.immunities).toContain("Sandstorm");
    expect(dto.immunities).not.toContain("sandstorm");
  });

  it("labels hail immunity (e.g. from Ice Body) as 'Hail'", async () => {
    const seel = mon("seel");
    expect(seel.abilities).toMatchObject({ H: "Ice Body" });

    const dto = await PokemonDataMapper.toDto(seel);

    expect(dto.immunities).toContain("Hail");
    expect(dto.immunities).not.toContain("hail");
  });
});
