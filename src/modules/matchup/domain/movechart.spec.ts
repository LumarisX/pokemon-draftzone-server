import { Rulesets } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { getTeamMoves } from "./movechart";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;

function mon(id: string) {
  return new PDZPokemon({ id }, NAT_DEX);
}

describe("getTeamMoves", () => {
  it("merges each move's learners into a single entry instead of duplicating it per Pokemon", async () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const result = await getTeamMoves([pikachu, charizard]);

    // Both can learn Body Slam; it should appear once, crediting both learners.
    const bodySlamEntries = result.moves.filter((m) => m.name === "Body Slam");
    expect(bodySlamEntries).toHaveLength(1);
    expect(bodySlamEntries[0].pokemon.sort()).toEqual(["charizard", "pikachu"]);
  });

  it("attributes a Pokemon-exclusive move only to that Pokemon", async () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const result = await getTeamMoves([pikachu, charizard]);

    const voltTackle = result.moves.find((m) => m.name === "Volt Tackle");
    expect(voltTackle?.pokemon).toEqual(["pikachu"]);
  });

  it("sorts moves alphabetically by name", async () => {
    const result = await getTeamMoves([mon("pikachu"), mon("charizard")]);

    const names = result.moves.map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("collects the union of all move tags actually present, sorted", async () => {
    const result = await getTeamMoves([mon("pikachu"), mon("charizard")]);

    expect(result.tags).toContain("Priority");
    expect(result.tags).toEqual([...result.tags].sort());
    expect(new Set(result.tags).size).toBe(result.tags.length);
  });

  it("includes each move's display data via Move.toData(), without a raw id field", async () => {
    const result = await getTeamMoves([mon("pikachu")]);

    const voltTackle = result.moves.find((m) => m.name === "Volt Tackle")!;
    expect(voltTackle).toMatchObject({
      name: "Volt Tackle",
      type: "Electric",
      category: "Physical",
    });
    expect(voltTackle).not.toHaveProperty("id");
  });

  it("includes each team Pokemon's client payload", async () => {
    const result = await getTeamMoves([mon("pikachu")]);

    expect(result.pokemon).toHaveLength(1);
    expect(result.pokemon[0]).toMatchObject({ id: "pikachu", name: "Pikachu" });
  });
});
