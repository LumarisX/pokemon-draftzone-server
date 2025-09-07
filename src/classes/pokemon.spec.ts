import { ID } from "@pkmn/data";
import { Dex } from "@pkmn/dex-types";
import { Ruleset } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";
import { DraftSpecie } from "./pokemon";

const mockRuleset = {
  name: "gen9nationaldex",
  species: {
    get: jest.fn((id: ID) => {
      if (id === ("pikachu" as ID)) {
        return {
          id: "pikachu" as ID,
          name: "Pikachu",
          baseSpecies: "Pikachu" as ID,
          abilities: { 0: "Static" },
          types: ["Electric"],
          baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
          toString: () => "Pikachu" as string,
          toJSON: () => ({}),
          unreleasedHidden: false,
          formeOrder: ["Pikachu", "Pikachu-Cosplay"],
        };
      } else if (id === ("raichu" as ID)) {
        return {
          id: "raichu" as ID,
          name: "Raichu",
          baseSpecies: "Pikachu" as ID,
          abilities: { 0: "Static" },
          types: ["Electric"],
          baseStats: { hp: 60, atk: 90, def: 55, spa: 90, spd: 80, spe: 110 },
          toString: () => "Raichu" as string,
          toJSON: () => ({}),
          unreleasedHidden: false,
        };
      } else if (id === ("charizard" as ID)) {
        return {
          id: "charizard" as ID,
          name: "Charizard",
          baseSpecies: "Charizard" as ID,
          abilities: { 0: "Blaze" },
          types: ["Fire", "Flying"],
          baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
          toString: () => "Charizard" as string,
          toJSON: () => ({}),
          unreleasedHidden: false,
          formeOrder: ["Charizard", "Charizard-Mega-X", "Charizard-Mega-Y"],
        };
      } else if (id === ("charizardmegax" as ID)) {
        return {
          id: "charizardmegax" as ID,
          name: "Charizard-Mega-X",
          baseSpecies: "Charizard" as ID,
          abilities: { 0: "Tough Claws" },
          types: ["Fire", "Dragon"],
          baseStats: {
            hp: 78,
            atk: 130,
            def: 111,
            spa: 130,
            spd: 85,
            spe: 100,
          },
          toString: () => "Charizard-Mega-X" as string,
          toJSON: () => ({}),
          unreleasedHidden: false,
          isNonstandard: null,
        };
      } else if (id === ("pikachucosplay" as ID)) {
        return {
          id: "pikachucosplay" as ID,
          name: "Pikachu-Cosplay",
          baseSpecies: "Pikachu" as ID,
          abilities: { 0: "Lightning Rod" },
          types: ["Electric"],
          baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
          toString: () => "Pikachu-Cosplay" as string,
          toJSON: () => ({}),
          unreleasedHidden: false,
          formeOrder: ["Pikachu", "Pikachu-Cosplay"],
        };
      } else if (id === ("snorlaxgigantamax" as ID)) {
        return {
          id: "snorlaxgigantamax" as ID,
          name: "Snorlax-Gmax",
          baseSpecies: "Snorlax" as ID,
          abilities: { 0: "Thick Fat" },
          types: ["Normal"],
          baseStats: { hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30 },
          toString: () => "Snorlax-Gmax" as string,
          toJSON: () => ({}),
          unreleasedHidden: false,
          isNonstandard: "Gigantamax",
        };
      }
      return undefined;
    }) as jest.Mock,
  },
  types: new Set([{ name: "Electric" }, { name: "Water" }, { name: "Fire" }]),
  dex: {} as Dex,
  exists: jest.fn(() => true),
  learnsets: { learnable: jest.fn() },
  moves: { get: jest.fn() },
} as unknown as Ruleset;

describe("DraftSpecie Constructor", () => {
  it("should correctly initialize with PokemonData", () => {
    const pokemonData: PokemonData = {
      id: "pikachu" as ID,
      nickname: "Pika",
      shiny: true,
      capt: { tera: ["Water"], z: ["Electric"], dmax: true },
      modifiers: { abilities: ["Lightning Rod"], moves: ["Thunderbolt"] },
      draftFormes: ["raichu" as ID],
    };

    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);

    expect(draftSpecie.id).toBe("pikachu");
    expect(draftSpecie.name).toBe("Pikachu");
    expect(draftSpecie.nickname).toBe("Pika");
    expect(draftSpecie.shiny).toBe(true);
    expect(draftSpecie.capt?.tera).toEqual(["Water"]);
    expect(draftSpecie.capt?.z).toEqual(["Electric"]);
    expect(draftSpecie.capt?.dmax).toBe(true);
    expect(draftSpecie.modifiers?.abilities).toEqual(["Lightning Rod"]);
    expect(draftSpecie.modifiers?.moves).toEqual(["Thunderbolt"]);
    expect(draftSpecie.draftFormes).toEqual(["raichu"]);
    expect(draftSpecie.ruleset).toBe(mockRuleset);
    expect(draftSpecie.abilities).toEqual({ 0: "Static" });
    expect(draftSpecie.bst).toBeDefined();
  });

  it("should handle unreleasedHidden abilities correctly", () => {
    const pokemonData: PokemonData = {
      id: "pikachu" as ID,
    };
    (mockRuleset.species.get as jest.Mock).mockReturnValueOnce({
      id: "pikachu" as ID,
      name: "Pikachu",
      baseSpecies: "Pikachu" as ID,
      abilities: { 0: "Static", 1: "Lightning Rod", H: "Hidden Ability" },
      types: ["Electric"],
      baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
      toString: (): string => "Pikachu",
      toJSON: () => ({}),
      unreleasedHidden: true,
    });

    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    expect(draftSpecie.abilities).toEqual({ 0: "Static", 1: "Lightning Rod" });
  });

  it("should correctly convert to PokemonFormData using toClient()", () => {
    const pokemonData: PokemonData = {
      id: "pikachu" as ID,
      nickname: "Pika",
      shiny: true,
      capt: { tera: ["Water"], z: ["Electric"], dmax: true },
      modifiers: { abilities: ["Lightning Rod"], moves: ["Thunderbolt"] },
      draftFormes: ["raichu" as ID],
    };
    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    const clientData = draftSpecie.toClient();

    expect(clientData.id).toBe("pikachu");
    expect(clientData.name).toBe("Pikachu");
    expect(clientData.nickname).toBe("Pika");
    expect(clientData.shiny).toBe(true);
    expect(clientData.capt?.tera).toEqual(["Water"]);
    expect(clientData.capt?.z).toEqual(["Electric"]);
    expect(clientData.capt?.dmax).toBe(true);
    expect(clientData.modifiers?.abilities).toEqual(["Lightning Rod"]);
    expect(clientData.modifiers?.moves).toEqual(["Thunderbolt"]);
    expect(clientData.draftFormes).toEqual([{ id: "raichu", name: "Raichu" }]);
  });

  it("should correctly convert to PokemonData using toData()", () => {
    const pokemonData: PokemonData = {
      id: "pikachu" as ID,
      nickname: "Pika",
      shiny: true,
      capt: { tera: ["Water"], z: ["Electric"], dmax: true },
      modifiers: { abilities: ["Lightning Rod"], moves: ["Thunderbolt"] },
      draftFormes: ["raichu" as ID],
    };
    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    const data = draftSpecie.toData();

    expect(data.id).toBe("pikachu");
    expect(data.nickname).toBe("Pika");
    expect(data.shiny).toBe(true);
    expect(data.capt?.tera).toEqual(["Water"]);
    expect(data.capt?.z).toEqual(["Electric"]);
    expect(data.capt?.dmax).toBe(true);
    expect(data.modifiers?.abilities).toEqual(["Lightning Rod"]);
    expect(data.modifiers?.moves).toEqual(["Thunderbolt"]);
    expect(data.draftFormes).toEqual(["raichu"]);
  });
});

describe("DraftSpecie formeNum getter", () => {
  it("should return the correct index when baseSpecies is the same as name and formeOrder is defined", () => {
    const pokemonData: PokemonData = { id: "pikachucosplay" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    expect(draftSpecie.formeNum).toBe(1);
  });

  it("should return 0 when baseSpecies is the same as name and formeOrder is not defined", () => {
    const pokemonData: PokemonData = { id: "raichu" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    expect(draftSpecie.formeNum).toBe(0);
  });

  it("should return the correct index when baseSpecies is different from name and formeOrder is defined for baseSpecies", () => {
    const pokemonData: PokemonData = { id: "charizardmegax" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    expect(draftSpecie.formeNum).toBe(1);
  });

  it("should return 0 when baseSpecies is different from name and formeOrder is not defined for baseSpecies", () => {
    const pokemonData: PokemonData = { id: "raichu" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    expect(draftSpecie.formeNum).toBe(0);
  });

  it("should handle Gigantamax forms correctly", () => {
    const pokemonData: PokemonData = { id: "snorlaxgigantamax" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, mockRuleset);
    expect(draftSpecie.formeNum).toBe(0);
  });
});
