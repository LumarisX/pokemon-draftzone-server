import { ID } from "@pkmn/data";
import { getRuleset } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";
import { DraftSpecie } from "./pokemon";

const ruleset = getRuleset("Gen9 NatDex");

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

    const draftSpecie = new DraftSpecie(pokemonData, ruleset);

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
    expect(draftSpecie.ruleset).toBe(ruleset);
    expect(draftSpecie.abilities).toEqual({
      "0": "Static",
      H: "Lightning Rod",
    });
    expect(draftSpecie.bst).toBeDefined();
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
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
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
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
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
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
    expect(draftSpecie.formeNum).toBe(7);
  });

  it("should return 0 when baseSpecies is the same as name and formeOrder is not defined", () => {
    const pokemonData: PokemonData = { id: "raichu" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
    expect(draftSpecie.formeNum).toBe(0);
  });

  it("should return the correct index when baseSpecies is different from name and formeOrder is defined for baseSpecies", () => {
    const pokemonData: PokemonData = { id: "charizardmegax" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
    expect(draftSpecie.formeNum).toBe(1);
  });

  it("should return 0 when baseSpecies is different from name and formeOrder is not defined for baseSpecies", () => {
    const pokemonData: PokemonData = { id: "raichu" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
    expect(draftSpecie.formeNum).toBe(0);
  });
});
