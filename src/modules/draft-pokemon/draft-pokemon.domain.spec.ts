import { Rulesets } from "@core/data/rulesets/rulesets";
import { ID } from "@pkmn/data";
import { DraftPokemon } from "./draft-pokemon.domain";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;
const ALOLA_DEX = Rulesets["Older Gens"]["Generation 7"].ruleset;

function mon(data: string | ({ id: string } & Record<string, any>)) {
  return new DraftPokemon(data as ID, NAT_DEX);
}

describe("DraftPokemon", () => {
  describe("constructor", () => {
    it("populates species fields from the ruleset for a valid id", () => {
      const pikachu = mon("pikachu");

      expect(pikachu.name).toBe("Pikachu");
      expect(pikachu.types).toEqual(["Electric"]);
      expect(pikachu.exists).toBe(true);
      expect(pikachu.ruleset).toBe(NAT_DEX);
    });

    it("throws SPECIES.NOT_FOUND for an unknown id", () => {
      let error: unknown;
      try {
        mon("notarealpokemon");
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ code: "SPC-001" });
    });

    it("carries over shiny, nickname, draftFormes, and modifiers", () => {
      const pikachu = mon({
        id: "pikachu",
        shiny: true,
        nickname: "Sparky",
        draftFormes: ["raichu"],
        modifiers: { abilities: ["Lightning Rod"], moves: ["volttackle"] },
      });

      expect(pikachu.shiny).toBe(true);
      expect(pikachu.nickname).toBe("Sparky");
      expect(pikachu.draftFormes).toEqual(["raichu"]);
      expect(pikachu.modifiers).toEqual({
        abilities: ["Lightning Rod"],
        moves: ["volttackle"],
      });
    });

    it("normalizes a full tera type list down to an empty array (meaning 'any type')", () => {
      const allTypes = Array.from(NAT_DEX.types).map((t) => t.name);
      const pikachu = mon({ id: "pikachu", capt: { tera: allTypes } });

      expect(pikachu.capt?.tera).toEqual([]);
    });

    it("keeps a partial tera type list as-is", () => {
      const pikachu = mon({ id: "pikachu", capt: { tera: ["Water"] } });

      expect(pikachu.capt?.tera).toEqual(["Water"]);
    });

    it("normalizes a full z-move type list down to an empty array, excluding Stellar from the count", () => {
      const allTypesExceptStellar = Array.from(NAT_DEX.types)
        .map((t) => t.name)
        .filter((name) => name !== "Stellar");
      const pikachu = mon({ id: "pikachu", capt: { z: allTypesExceptStellar } });

      expect(pikachu.capt?.z).toEqual([]);
    });

    it("only exposes abilities 0, 1, and S when the hidden ability is unreleased", () => {
      // Heatran's Hidden Ability (Flame Body) wasn't released yet as of Gen 7 Alola.
      const heatran = new DraftPokemon("heatran" as ID, ALOLA_DEX);

      expect(heatran.unreleasedHidden).toBe(true);
      expect(heatran.abilities).toEqual({
        0: "Flash Fire",
        1: undefined,
        S: undefined,
      });
    });
  });

  describe("getAbilities", () => {
    it("returns the species' ability list when no modifier override is set", () => {
      expect(mon("pikachu").getAbilities()).toEqual(["Static", "Lightning Rod"]);
    });

    it("returns the modifier override instead of the species' abilities when set", () => {
      const pikachu = mon({ id: "pikachu", modifiers: { abilities: ["Levitate"] } });

      expect(pikachu.getAbilities()).toEqual(["Levitate"]);
    });
  });

  describe("typeWeak / typechart / getWeak / getResists / getImmune", () => {
    it("computes the combined type matchup for a dual-type Pokemon", () => {
      const charizard = mon("charizard");

      expect(charizard.getWeak().sort()).toEqual(
        ["Electric", "Rock", "Water"].sort(),
      );
      expect(charizard.getResists().sort()).toEqual(
        ["Bug", "Fairy", "Fighting", "Fire", "Grass", "Steel"].sort(),
      );
      expect(charizard.getImmune()).toEqual(["Ground"]);
    });

    it("matches the static typeWeak helper for the same types", () => {
      const direct = DraftPokemon.typeWeak(["Fire", "Flying"], NAT_DEX);

      expect(direct.Ground).toBe(0);
      expect(direct.Bug).toBeCloseTo(0.25);
      // Quad weak: both Fire and Flying are individually 2x weak to Rock.
      expect(direct.Rock).toBeCloseTo(4);
    });

    it("caches the typechart after the first computation", () => {
      const charizard = mon("charizard");

      const first = charizard.typechart();
      const second = charizard.typechart();

      expect(first).toBe(second);
    });
  });

  describe("formeNum", () => {
    it("is 0 for a base forme with a formeOrder", () => {
      expect(mon("rotom").formeNum).toBe(0);
    });

    it("looks up its index within the base species' formeOrder for an alternate forme", () => {
      expect(mon("rotomheat").formeNum).toBe(1);
      expect(mon("rotomwash").formeNum).toBe(2);
    });
  });

  describe("canLearn", () => {
    it("always returns true for Smeargle regardless of the move", () => {
      expect(mon("smeargle").canLearn("explosion")).resolves.toBe(true);
    });

    it("returns true for a move the Pokemon can actually learn", async () => {
      await expect(mon("pikachu").canLearn("thunderbolt")).resolves.toBe(true);
    });

    it("returns false for a move the Pokemon cannot learn", async () => {
      await expect(mon("pikachu").canLearn("flamethrower")).resolves.toBe(false);
    });
  });

  describe("coverage", () => {
    it("matches the recorded baseline for a Pokemon with no Tera type set", async () => {
      const result = await mon("pikachu").coverage();

      expect(result).toMatchSnapshot();
    });

    it("injects a Tera Blast entry of the chosen type when one isn't already covered", async () => {
      const pikachuTeraWater = mon({ id: "pikachu", capt: { tera: ["Water"] } });

      const result = await pikachuTeraWater.coverage();

      const teraBlastEntries = [...result.physical, ...result.special].filter(
        (m) => m.id === "terablast",
      );
      expect(teraBlastEntries).toHaveLength(2);
      expect(teraBlastEntries[0].type).toBe("Water");
    });

    it("doesn't inject an extra Tera Blast entry when no Tera type is set", async () => {
      const result = await mon("pikachu").coverage();

      // Pikachu still naturally learns Tera Blast as a TM; without a Tera
      // type set it should only appear once, untyped (i.e. its default Normal type).
      const teraBlastEntries = [...result.physical, ...result.special].filter(
        (m) => m.id === "terablast",
      );
      expect(teraBlastEntries).toHaveLength(1);
      expect(teraBlastEntries[0].type).toBe("Normal");
    });
  });

  describe("fullcoverage", () => {
    it("matches the recorded baseline grouping moves by type", async () => {
      const result = await mon("pikachu").fullcoverage();

      expect(result).toMatchSnapshot();
    });
  });

  describe("bestCoverage", () => {
    it("recommends at most 4 moves out of a larger coverage pool, deterministically", async () => {
      const pikachu = mon("pikachu");
      const opponent = [mon("charizard"), mon("gyarados")];

      const result = await pikachu.bestCoverage(opponent);
      const allMoves = [...result.physical, ...result.special];
      const recommended = allMoves.filter((m) => m.recommended);

      expect(allMoves.length).toBeGreaterThan(4);
      expect(recommended.length).toBeLessThanOrEqual(4);

      const secondRun = await pikachu.bestCoverage(opponent);
      const secondRecommended = [
        ...secondRun.physical,
        ...secondRun.special,
      ].filter((m) => m.recommended);
      expect(secondRecommended.map((m) => m.id)).toEqual(
        recommended.map((m) => m.id),
      );
    });
  });

  describe("toTeambuilder", () => {
    it("includes the species' identity, types, baseStats, and non-empty abilities", async () => {
      const pikachu = mon("pikachu");

      const result = await pikachu.toTeambuilder();

      expect(result.id).toBe("pikachu");
      expect(result.name).toBe("Pikachu");
      expect(result.types).toEqual(["Electric"]);
      expect(result.baseStats).toEqual(pikachu.baseStats);
      expect(result.abilities).toEqual(["Static", "Lightning Rod"]);
    });

    it("derives genders from a positive M/F ratio, and an empty array for a genderless species", async () => {
      expect((await mon("pikachu").toTeambuilder()).genders).toEqual(["M", "F"]);
      expect((await mon("magnemite").toTeambuilder()).genders).toEqual([]);
    });

    it("resolves item to the single requiredItem's name when set", async () => {
      const megaCharizardX = mon("charizardmegax");

      const result = await megaCharizardX.toTeambuilder();

      expect(result.item).toBe("Charizardite X");
    });

    it("resolves item to the first of several requiredItems when there's no single requiredItem", async () => {
      const arceusBug = mon("arceusbug");
      expect(arceusBug.requiredItem).toBeUndefined();
      expect(arceusBug.requiredItems).toEqual(["Insect Plate", "Buginium Z"]);

      const result = await arceusBug.toTeambuilder();

      expect(result.item).toBe("Insect Plate");
    });

    it("leaves item undefined when the species requires no specific item", async () => {
      expect((await mon("pikachu").toTeambuilder()).item).toBeUndefined();
    });

    it("includes the species' own requiredItem in the items list even if itemUser would otherwise exclude it", async () => {
      const megaCharizardX = mon("charizardmegax");

      const result = await megaCharizardX.toTeambuilder();

      expect(result.items.some((i) => i.name === "Charizardite X")).toBe(true);
      // A different Mega Stone, restricted to a different species, shouldn't appear.
      expect(result.items.some((i) => i.name === "Venusaurite")).toBe(false);
    });

    it("tags items by category (Berry/Choice/Mega/etc.)", async () => {
      const pikachu = mon("pikachu");

      const result = await pikachu.toTeambuilder();

      const lightBall = result.items.find((i) => i.name === "Light Ball");
      expect(lightBall).toBeDefined();
      const choiceBand = result.items.find((i) => i.name === "Choice Band");
      expect(choiceBand?.tags).toContain("Choice");
    });

    it("replaces every space in a multi-word item name when building its pngId", async () => {
      const pikachu = mon("pikachu");

      const result = await pikachu.toTeambuilder();

      const goldBottleCap = result.items.find((i) => i.name === "Gold Bottle Cap");
      expect(goldBottleCap?.pngId).toBe(
        "https://play.pokemonshowdown.com/sprites/itemicons/gold-bottle-cap.png",
      );
    });

    it("produces a clean pngId for a normal one-space item name", async () => {
      const pikachu = mon("pikachu");

      const result = await pikachu.toTeambuilder();

      const lightBall = result.items.find((i) => i.name === "Light Ball");
      expect(lightBall?.pngId).toBe(
        "https://play.pokemonshowdown.com/sprites/itemicons/light-ball.png",
      );
    });
  });
});
