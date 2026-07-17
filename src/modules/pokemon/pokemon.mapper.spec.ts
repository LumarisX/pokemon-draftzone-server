import { Rulesets } from "@core/data/rulesets/rulesets";
import { ID } from "@pkmn/data";
import { PDZPokemon } from "./pokemon.domain";
import { PokemonDto } from "./pokemon.dto";
import { PokemonMapper } from "./pokemon.mapper";
import { PokemonEntity } from "./pokemon.schema";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;
const ALL_TYPES = Array.from(NAT_DEX.types).map((t) => t.name);
const ALL_TYPES_NO_STELLAR = ALL_TYPES.filter((name) => name !== "Stellar");

describe("PokemonMapper", () => {
  describe("fromDatabase", () => {
    function buildEntity(overrides: Partial<PokemonEntity> = {}): PokemonEntity {
      return {
        id: "pikachu",
        shiny: true,
        nickname: "Sparky",
        draftFormes: ["raichu"],
        modifiers: { abilities: ["Lightning Rod"], moves: ["volttackle"] },
        capt: { tera: ["Water"], z: ["Fire"], dmax: true },
        ...overrides,
      };
    }

    it("builds a Pokemon with the entity's stored fields", () => {
      const result = PokemonMapper.fromDatabase(buildEntity(), NAT_DEX);

      expect(result).toBeInstanceOf(PDZPokemon);
      expect(result.id).toBe("pikachu");
      expect(result.shiny).toBe(true);
      expect(result.nickname).toBe("Sparky");
      expect(result.draftFormes).toEqual(["raichu"]);
      expect(result.modifiers).toEqual({
        abilities: ["Lightning Rod"],
        moves: ["volttackle"],
      });
      expect(result.capt).toEqual({ tera: ["Water"], z: ["Fire"], dmax: true });
    });

    it("normalizes legacy object-shaped draftFormes entries to ids", () => {
      const result = PokemonMapper.fromDatabase(
        buildEntity({
          draftFormes: [
            { id: "raichu", name: "Raichu" },
          ] as unknown as string[],
        }),
        NAT_DEX,
      );

      expect(result.draftFormes).toEqual(["raichu"]);
    });

    it("leaves capt/modifiers undefined when the entity has none", () => {
      const result = PokemonMapper.fromDatabase(
        buildEntity({ capt: undefined, modifiers: undefined }),
        NAT_DEX,
      );

      expect(result.capt).toEqual({ tera: undefined, z: undefined, dmax: undefined });
      expect(result.modifiers).toEqual({ moves: undefined, abilities: undefined });
    });
  });

  describe("fromForm", () => {
    function buildDto(overrides: Partial<PokemonDto> = {}): PokemonDto {
      return {
        id: "charizard",
        name: "Charizard",
        shiny: false,
        nickname: "Blaze",
        draftFormes: [{ id: "charizardmegax", name: "Charizard-Mega-X" }],
        modifiers: { abilities: ["Solar Power"] },
        capt: { tera: ["Water"], dmax: false },
        ...overrides,
      };
    }

    it("builds a Pokemon with the form's submitted fields", () => {
      const result = PokemonMapper.fromForm(buildDto(), NAT_DEX);

      expect(result).toBeInstanceOf(PDZPokemon);
      expect(result.id).toBe("charizard");
      expect(result.shiny).toBe(false);
      expect(result.nickname).toBe("Blaze");
      expect(result.draftFormes).toEqual(["charizardmegax"]);
      expect(result.modifiers).toEqual({ abilities: ["Solar Power"], moves: undefined });
      expect(result.capt).toEqual({ tera: ["Water"], z: undefined, dmax: false });
    });
  });

  describe("toDatabasePayload", () => {
    it("copies the domain object's fields into the persisted shape", () => {
      const pokemon = new PDZPokemon(
        {
          id: "pikachu",
          shiny: true,
          nickname: "Sparky",
          draftFormes: ["raichu"] as ID[],
          modifiers: { abilities: ["Lightning Rod"] },
          capt: { tera: ["Water"], dmax: true },
        },
        NAT_DEX,
      );

      const result = PokemonMapper.toDatabasePayload(pokemon);

      expect(result).toEqual({
        id: "pikachu",
        nickname: "Sparky",
        shiny: true,
        draftFormes: ["raichu"],
        modifiers: { abilities: ["Lightning Rod"], moves: undefined },
        capt: { tera: ["Water"], z: undefined, dmax: true },
      });
    });
  });

  describe("toClientPayload", () => {
    it("expands draftForme ids into { id, name } objects for the client", () => {
      const pikachu = new PDZPokemon(
        { id: "pikachu", draftFormes: ["raichu"] as ID[] },
        NAT_DEX,
      );

      const result = PokemonMapper.toClientPayload(pikachu);

      expect(result.draftFormes).toEqual([{ id: "raichu", name: "Raichu" }]);
    });

    it("includes the resolved name and passes through a partial Tera type list as-is", () => {
      const pikachu = new PDZPokemon(
        { id: "pikachu", capt: { tera: ["Water"] } },
        NAT_DEX,
      );

      const result = PokemonMapper.toClientPayload(pikachu);

      expect(result.name).toBe("Pikachu");
      expect(result.capt?.tera).toEqual(["Water"]);
    });

    it("expands an empty Tera type list (meaning 'any type') back out to every type", () => {
      const pikachu = new PDZPokemon(
        { id: "pikachu", capt: { tera: ALL_TYPES } },
        NAT_DEX,
      );
      expect(pikachu.capt?.tera).toEqual([]);

      const result = PokemonMapper.toClientPayload(pikachu);

      expect(result.capt?.tera).toEqual(ALL_TYPES);
    });

    it("expands an empty z-move type list back out to every type except Stellar", () => {
      const pikachu = new PDZPokemon(
        { id: "pikachu", capt: { z: ALL_TYPES_NO_STELLAR } },
        NAT_DEX,
      );
      expect(pikachu.capt?.z).toEqual([]);

      const result = PokemonMapper.toClientPayload(pikachu);

      expect(result.capt?.z).toEqual(ALL_TYPES_NO_STELLAR);
    });

    it("leaves capt.tera undefined (not expanded) when no Tera type was set at all", () => {
      const pikachu = new PDZPokemon({ id: "pikachu" }, NAT_DEX);

      const result = PokemonMapper.toClientPayload(pikachu);

      expect(result.capt?.tera).toBeUndefined();
    });

    it("returns capt as undefined (not an all-undefined object) when the Pokemon has no capt data at all", () => {
      const pikachu = new PDZPokemon({ id: "pikachu" }, NAT_DEX);

      const result = PokemonMapper.toClientPayload(pikachu);

      expect(result.capt).toBeUndefined();
    });

    it("still returns a capt object when only dmax is set", () => {
      const pikachu = new PDZPokemon({ id: "pikachu", capt: { dmax: true } }, NAT_DEX);

      const result = PokemonMapper.toClientPayload(pikachu);

      expect(result.capt).toEqual({ tera: undefined, z: undefined, dmax: true });
    });
  });
});
