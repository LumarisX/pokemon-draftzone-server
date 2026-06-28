import { Rulesets } from "@core/data/rulesets/rulesets";
import { ID } from "@pkmn/data";
import { PDZPokemonSet } from "./pokemon-set.domain";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;
const CHAMPIONS_MA = Rulesets["Gen 9"]["Champions"].ruleset;

function set(
  data: string | ({ id: string } & Record<string, any>),
  ruleset = NAT_DEX,
) {
  return new PDZPokemonSet(data as ID, ruleset);
}

describe("PDZPokemonSet", () => {
  describe("constructor", () => {
    it("is a PDZPokemon with showdown-style set defaults applied", () => {
      const pikachu = set("pikachu");

      expect(pikachu.name).toBe("Pikachu");
      expect(pikachu.level).toBe(100);
      expect(pikachu.ivs).toEqual({
        hp: 31,
        atk: 31,
        def: 31,
        spa: 31,
        spd: 31,
        spe: 31,
      });
      expect(pikachu.evs).toEqual({
        hp: 0,
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
      });
      expect(pikachu.gender).toBe("M");
      expect(pikachu.ability).toBe("Static");
      expect(pikachu.moves).toEqual([]);
    });

    it("defaults to N for genderless species", () => {
      expect(set("magnemite").gender).toBe("N");
    });

    it("carries over explicit set fields", () => {
      const pikachu = set({
        id: "pikachu",
        level: 50,
        ivs: { spe: 0 },
        evs: { atk: 252, spe: 252 },
        gender: "F",
        nature: "jolly",
        item: "lightball",
        ability: "lightningrod",
        moves: ["thunderbolt", "voltswitch"],
        teraType: "Electric",
      });

      expect(pikachu.level).toBe(50);
      expect(pikachu.ivs).toEqual({
        hp: 31,
        atk: 31,
        def: 31,
        spa: 31,
        spd: 31,
        spe: 0,
      });
      expect(pikachu.evs).toEqual({
        hp: 0,
        atk: 252,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 252,
      });
      expect(pikachu.gender).toBe("F");
      expect(pikachu.nature).toBe("Jolly");
      expect(pikachu.item).toBe("Light Ball");
      expect(pikachu.ability).toBe("Lightning Rod");
      expect(pikachu.moves.map((m) => m.name)).toEqual([
        "Thunderbolt",
        "Volt Switch",
      ]);
      expect(pikachu.teraType).toBe("Electric");
    });

    it("still inherits PDZPokemon behavior like typechart", () => {
      const charizard = set("charizard");

      expect(charizard.getWeak().sort()).toEqual(
        ["Electric", "Rock", "Water"].sort(),
      );
    });
  });

  describe("stats", () => {
    it("forwards base stats, IVs, EVs, level, and nature to the ruleset's stat calculator", () => {
      const pikachu = set({
        id: "pikachu",
        level: 50,
        ivs: { atk: 31 },
        evs: { atk: 252 },
        nature: "adamant",
      });

      const nature = NAT_DEX.natures.get("adamant");
      const expectedAtk = NAT_DEX.stats.calc(
        "atk",
        pikachu.baseStats.atk,
        31,
        252,
        50,
        nature,
      );

      expect(pikachu.stats.atk).toBe(expectedAtk);
    });

    it("uses neutral stats when no nature is set", () => {
      const pikachu = set("pikachu");

      const expectedSpe = NAT_DEX.stats.calc(
        "spe",
        pikachu.baseStats.spe,
        31,
        0,
        100,
        undefined,
      );

      expect(pikachu.stats.spe).toBe(expectedSpe);
    });
  });

  describe("useStatPoints rulesets", () => {
    it("defaults sps to 0 per stat, pins ivs at 31, and derives evs as 0 at sps=0", () => {
      const pikachu = set("pikachu", CHAMPIONS_MA);

      expect(pikachu.sps).toEqual({
        hp: 0,
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
      });
      expect(pikachu.ivs).toEqual({
        hp: 31,
        atk: 31,
        def: 31,
        spa: 31,
        spd: 31,
        spe: 31,
      });
      expect(pikachu.evs).toEqual({
        hp: 0,
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
      });
    });

    it("derives evs as sps * 8 - 4 for sps 1-32 (max sps of 32 maps to the max ev of 252)", () => {
      const pikachu = set(
        { id: "pikachu", sps: { spe: 32, atk: 17 } },
        CHAMPIONS_MA,
      );

      expect(pikachu.sps).toEqual({
        hp: 0,
        atk: 17,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 32,
      });
      expect(pikachu.evs.spe).toBe(252);
      expect(pikachu.evs.atk).toBe(132);
      expect(pikachu.evs.hp).toBe(0);
    });

    it("ignores ivs/evs input in favor of sps", () => {
      const pikachu = set(
        { id: "pikachu", ivs: { spe: 0 }, evs: { spe: 252 }, sps: { spe: 5 } },
        CHAMPIONS_MA,
      );

      expect(pikachu.ivs.spe).toBe(31);
      expect(pikachu.evs.spe).toBe(36);
    });
  });

  describe("isLegal", () => {
    it("returns true for a completely valid default set", () => {
      const pikachu = set("pikachu");
      expect(pikachu.isLegal).toBe(true);
    });

    describe("level validation", () => {
      it("returns false if level is greater than 100", () => {
        const pikachu = set({ id: "pikachu", level: 101 });
        expect(pikachu.isLegal).toBe(false);
      });

      it("returns false if level is less than 0", () => {
        const pikachu = set({ id: "pikachu", level: -1 });
        expect(pikachu.isLegal).toBe(false);
      });

      it("returns false if level is a decimal fraction", () => {
        const pikachu = set({ id: "pikachu", level: 50.5 });
        expect(pikachu.isLegal).toBe(false);
      });
    });

    describe("with traditional stat points ruleset (NAT_DEX)", () => {
      it("returns false if total EVs exceed the maximum allowed (508)", () => {
        const pikachu = set(
          {
            id: "pikachu",
            evs: { hp: 252, atk: 252, spe: 252 },
          },
          NAT_DEX,
        );
        expect(pikachu.isLegal).toBe(false);
      });

      it("returns false if an individual EV exceeds the maximum allowed (252)", () => {
        const pikachu = set(
          {
            id: "pikachu",
            evs: { hp: 253 },
          },
          NAT_DEX,
        );
        expect(pikachu.isLegal).toBe(false);
      });

      it("returns false if an individual IV exceeds the maximum allowed (31)", () => {
        const pikachu = set(
          {
            id: "pikachu",
            ivs: { hp: 32 },
          },
          NAT_DEX,
        );
        expect(pikachu.isLegal).toBe(false);
      });

      it("returns false if EVs contain negative values or decimals", () => {
        const negativePikachu = set(
          { id: "pikachu", evs: { hp: -10 } },
          NAT_DEX,
        );
        const decimalPikachu = set(
          { id: "pikachu", evs: { hp: 10.5 } },
          NAT_DEX,
        );

        expect(negativePikachu.isLegal).toBe(false);
        expect(decimalPikachu.isLegal).toBe(false);
      });
    });

    describe("with alternative SP ruleset (CHAMPIONS_MA)", () => {
      it("returns false if total SPs exceed the maximum allowed (66)", () => {
        const pikachu = set(
          {
            id: "pikachu",
            sps: { hp: 32, atk: 32, spe: 32 },
          },
          CHAMPIONS_MA,
        );
        expect(pikachu.isLegal).toBe(false);
      });
      it("returns true for a valid SP configuration up to the maximum (32)", () => {
        const pikachu = set(
          { id: "pikachu", sps: { spe: 32, atk: 15 } },
          CHAMPIONS_MA,
        );
        expect(pikachu.isLegal).toBe(true);
      });

      it("returns false if an individual SP exceeds the maximum allowed (32)", () => {
        const pikachu = set({ id: "pikachu", sps: { spe: 33 } }, CHAMPIONS_MA);
        expect(pikachu.isLegal).toBe(false);
      });

      it("returns false if SPs contain negative values or decimals", () => {
        const negativePikachu = set(
          { id: "pikachu", sps: { spe: -5 } },
          CHAMPIONS_MA,
        );
        const decimalPikachu = set(
          { id: "pikachu", sps: { spe: 12.5 } },
          CHAMPIONS_MA,
        );

        expect(negativePikachu.isLegal).toBe(false);
        expect(decimalPikachu.isLegal).toBe(false);
      });
    });
  });
});
