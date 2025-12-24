import { ID, ItemName } from "@pkmn/data";
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

describe("DraftSpecie Type functions", () => {
  let pikachu: DraftSpecie;
  let charizard: DraftSpecie;

  beforeAll(() => {
    pikachu = new DraftSpecie({ id: "pikachu" as ID }, ruleset);
    charizard = new DraftSpecie({ id: "charizard" as ID }, ruleset);
  });

  it("should return the correct typechart for a single-type Pokemon", () => {
    const typechart = pikachu.typechart();
    expect(typechart["Ground"]).toBe(2);
    expect(typechart["Flying"]).toBe(0.5);
    expect(typechart["Electric"]).toBe(0);
    expect(typechart["Steel"]).toBe(0.5);
    expect(typechart["Grass"]).toBe(1);
  });

  it("should return the correct typechart for a dual-type Pokemon", () => {
    const typechart = charizard.typechart();
    expect(typechart["Rock"]).toBe(4);
    expect(typechart["Water"]).toBe(2);
    expect(typechart["Electric"]).toBe(2);
    expect(typechart["Grass"]).toBe(0.25);
    expect(typechart["Fighting"]).toBe(0.5);
    expect(typechart["Bug"]).toBe(0.25);
    expect(typechart["Steel"]).toBe(0.5);
    expect(typechart["Fire"]).toBe(0.5);
    expect(typechart["Fairy"]).toBe(0.5);
  });

  it("should return correct weaknesses", () => {
    expect(pikachu.getWeak().sort()).toEqual(["Ground"].sort());
    expect(charizard.getWeak().sort()).toEqual(
      ["Rock", "Water", "Electric"].sort()
    );
  });

  it("should return correct resistances", () => {
    expect(pikachu.getResists().sort()).toEqual(["Flying", "Steel"].sort());
    expect(charizard.getResists().sort()).toEqual(
      ["Grass", "Fighting", "Bug", "Steel", "Fire", "Fairy"].sort()
    );
  });

  it("should return correct immunities", () => {
    expect(pikachu.getImmune().sort()).toEqual(["Electric"].sort());
    expect(charizard.getImmune().sort()).toEqual(["Ground"].sort());
  });
});

describe("DraftSpecie Ability functions", () => {
  it("should return abilities from modifiers if present", () => {
    const pokemonData: PokemonData = {
      id: "pikachu" as ID,
      modifiers: { abilities: ["Lightning Rod"] },
    };
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
    expect(draftSpecie.getAbilities()).toEqual(["Lightning Rod"]);
  });

  it("should return abilities from specie.abilities if no modifiers", () => {
    const pokemonData: PokemonData = { id: "pikachu" as ID };
    const draftSpecie = new DraftSpecie(pokemonData, ruleset);
    expect(draftSpecie.getAbilities()).toEqual(["Static", "Lightning Rod"]);
  });
});

describe("DraftSpecie Learnset functions", () => {
  let pikachu: DraftSpecie;
  let smeargle: DraftSpecie;

  beforeAll(() => {
    pikachu = new DraftSpecie({ id: "pikachu" as ID }, ruleset);
    smeargle = new DraftSpecie({ id: "smeargle" as ID }, ruleset);
  });

  it("should return a list of moves for learnset()", async () => {
    const learnset = await pikachu.learnset();
    expect(learnset).toBeInstanceOf(Array);
    expect(learnset.length).toBeGreaterThan(0);
    expect(learnset[0]).toHaveProperty("name");
    expect(learnset[0]).toHaveProperty("id");
  });

  it("should return true if the Pokemon can learn the move", async () => {
    const canLearnThunderbolt = await pikachu.canLearn("thunderbolt");
    expect(canLearnThunderbolt).toBe(true);
  });

  it("should return false if the Pokemon cannot learn the move", async () => {
    const canLearnBlastBurn = await pikachu.canLearn("blastburn");
    expect(canLearnBlastBurn).toBe(false);
  });

  it("should return true for Smeargle regardless of the move", async () => {
    const canLearnAnyMoveSmeargle = await smeargle.canLearn("spacialrend");
    expect(canLearnAnyMoveSmeargle).toBe(true);
  });
});

describe("DraftSpecie toTeambuilder()", () => {
  let pikachu: DraftSpecie;

  beforeAll(() => {
    pikachu = new DraftSpecie({ id: "pikachu" as ID }, ruleset);
  });

  it("should return correct abilities", async () => {
    const teambuilderData = await pikachu.toTeambuilder();
    expect(teambuilderData.abilities).toEqual(["Static", "Lightning Rod"]);
  });

  it("should return correct items", async () => {
    const teambuilderData = await pikachu.toTeambuilder();
    // Expecting a subset of items, as Pikachu doesn't have required items
    expect(teambuilderData.items.length).toBeGreaterThan(0);
    expect(teambuilderData.items[0]).toHaveProperty("name");
    expect(teambuilderData.items[0]).toHaveProperty("id");
    expect(teambuilderData.items[0]).toHaveProperty("pngId");
    expect(teambuilderData.items[0]).toHaveProperty("desc");
    expect(teambuilderData.items[0]).toHaveProperty("tags");
  });

  // it("should return a sorted learnset with correct move data", async () => {
  //   const teambuilderData = await pikachu.toTeambuilder();
  //   expect(teambuilderData.learnset).toBeInstanceOf(Array);
  //   expect(teambuilderData.learnset.length).toBeGreaterThan(0);
  //   // Check if sorted by effectivePower (descending)
  //   for (let i = 0; i < teambuilderData.learnset.length - 1; i++) {
  //     expect(teambuilderData.learnset[i].effectivePower).toBeGreaterThanOrEqual(
  //       teambuilderData.learnset[i + 1].effectivePower
  //     );
  //   }
  //   expect(teambuilderData.learnset[0]).toHaveProperty("id");
  //   expect(teambuilderData.learnset[0]).toHaveProperty("name");
  //   expect(teambuilderData.learnset[0]).toHaveProperty("type");
  //   expect(teambuilderData.learnset[0]).toHaveProperty("category");
  //   expect(teambuilderData.learnset[0]).toHaveProperty("effectivePower");
  //   expect(teambuilderData.learnset[0]).toHaveProperty("basePower");
  //   expect(teambuilderData.learnset[0]).toHaveProperty("accuracy");
  // });

  it("should return correct data from toClient() with added types and baseStats", async () => {
    const teambuilderData = await pikachu.toTeambuilder();
    const clientData = pikachu.toClient();
    expect(teambuilderData.data).toEqual({
      ...clientData,
      types: pikachu.types,
      baseStats: pikachu.baseStats,
    });
  });
});

describe("DraftSpecie Coverage functions", () => {
  let ogerpon: DraftSpecie;
  let ogerponWellspring: DraftSpecie;
  let ogerponCornerstone: DraftSpecie;
  let ogerponHearthflame: DraftSpecie;
  let pikachu: DraftSpecie;
  let charizard: DraftSpecie;

  beforeAll(() => {
    ogerpon = new DraftSpecie({ id: "ogerpon" as ID }, ruleset);
    ogerponWellspring = new DraftSpecie(
      {
        id: "ogerponwellspring" as ID,
        capt: { tera: ["Water"] },
      },
      ruleset
    );
    ogerponCornerstone = new DraftSpecie(
      {
        id: "ogerponcornerstone" as ID,
        capt: { tera: ["Rock"] },
      },
      ruleset
    );
    ogerponHearthflame = new DraftSpecie(
      {
        id: "ogerponhearthflame" as ID,
        capt: { tera: ["Fire"] },
      },
      ruleset
    );
    pikachu = new DraftSpecie({ id: "pikachu" as ID }, ruleset);
    charizard = new DraftSpecie({ id: "charizard" as ID }, ruleset);
  });

  it("should return physical and special coverage moves for coverage()", async () => {
    const coverage = await pikachu.coverage();
    expect(coverage).toHaveProperty("physical");
    expect(coverage).toHaveProperty("special");
    expect(coverage.physical).toBeInstanceOf(Array);
    expect(coverage.special).toBeInstanceOf(Array);
    expect(coverage.physical.length).toBeGreaterThan(0);
    expect(coverage.special.length).toBeGreaterThan(0);
  });

  it("should handle ivycudgel with requiredItem for coverage()", async () => {
    const coverageWellspring = await ogerponWellspring.coverage();
    const coverageCornerstone = await ogerponCornerstone.coverage();
    const coverageHearthflame = await ogerponHearthflame.coverage();

    expect(
      coverageWellspring.physical.some(
        (move) => move.id === "ivycudgel" && move.type === "Water"
      )
    ).toBe(true);
    expect(
      coverageCornerstone.physical.some(
        (move) => move.id === "ivycudgel" && move.type === "Rock"
      )
    ).toBe(true);
    expect(
      coverageHearthflame.physical.some(
        (move) => move.id === "ivycudgel" && move.type === "Fire"
      )
    ).toBe(true);
  });

  it("should include Tera Blast if capt.tera is present and terablast is learnable for coverage()", async () => {
    const teraPikachu = new DraftSpecie(
      { id: "pikachu" as ID, capt: { tera: ["Dragon"] } },
      ruleset
    );
    const coverage = await teraPikachu.coverage();
    expect(
      coverage.physical.some(
        (move) => move.id === "terablast" && move.type === "Dragon"
      )
    ).toBe(true);
    expect(
      coverage.special.some(
        (move) => move.id === "terablast" && move.type === "Dragon"
      )
    ).toBe(true);
  });

  it("should use the cache for coverage()", async () => {
    const initialCoverage = await pikachu.coverage();
    const cachedCoverage = await pikachu.coverage();
    expect(initialCoverage).toBe(cachedCoverage); // Should be the same object due to caching
  });

  it("should return physical and special full coverage moves for fullcoverage()", async () => {
    const fullCoverage = await pikachu.fullcoverage();
    expect(fullCoverage).toHaveProperty("physical");
    expect(fullCoverage).toHaveProperty("special");
    expect(Object.keys(fullCoverage.physical).length).toBeGreaterThan(0);
    expect(Object.keys(fullCoverage.special).length).toBeGreaterThan(0);
  });

  it("should handle ivycudgel with requiredItem for fullcoverage()", async () => {
    const fullCoverageWellspring = await ogerponWellspring.fullcoverage();
    const fullCoverageCornerstone = await ogerponCornerstone.fullcoverage();
    const fullCoverageHearthflame = await ogerponHearthflame.fullcoverage();

    expect(
      fullCoverageWellspring.physical["Water"].some(
        (move) => move.id === "ivycudgel"
      )
    ).toBe(true);
    expect(
      fullCoverageCornerstone.physical["Rock"].some(
        (move) => move.id === "ivycudgel"
      )
    ).toBe(true);
    expect(
      fullCoverageHearthflame.physical["Fire"].some(
        (move) => move.id === "ivycudgel"
      )
    ).toBe(true);
  });

  it("should include Tera Blast if capt.tera is present and terablast is learnable for fullcoverage()", async () => {
    const teraPikachu = new DraftSpecie(
      { id: "pikachu" as ID, capt: { tera: ["Water"] } },
      ruleset
    );
    const fullCoverage = await teraPikachu.fullcoverage();
    expect(
      fullCoverage.physical["Water"].some((move) => move.id === "terablast")
    ).toBe(true);
    expect(
      fullCoverage.special["Water"].some((move) => move.id === "terablast")
    ).toBe(true);
  });

  it("should use the cache for fullcoverage()", async () => {
    const initialFullCoverage = await pikachu.fullcoverage();
    const cachedFullCoverage = await pikachu.fullcoverage();
    expect(initialFullCoverage).toBe(cachedFullCoverage); // Should be the same object due to caching
  });
});
