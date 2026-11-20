import { Rulesets } from "@core/data/rulesets/rulesets";
import { ID } from "@pkmn/data";
import { PDZMove } from "./move.domain";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;

function move(id: string) {
  return new PDZMove(id as ID, NAT_DEX);
}

describe("PDZMove", () => {
  describe("constructor", () => {
    it("populates move fields from the ruleset for a valid id", () => {
      const tackle = move("tackle");

      expect(tackle.name).toBe("Tackle");
      expect(tackle.basePower).toBe(40);
      expect(tackle.exists).toBe(true);
      expect(tackle.ruleset).toBe(NAT_DEX);
    });

    it("throws MOVE.NOT_FOUND for an unknown move id", () => {
      let error: unknown;
      try {
        move("notarealmove");
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ code: "MOV-001" });
    });

    it("accepts an already-resolved Move object instead of an id", () => {
      const tackleData = NAT_DEX.moves.get("tackle")!;

      const tackle = new PDZMove(tackleData, NAT_DEX);

      expect(tackle.name).toBe("Tackle");
    });
  });

  describe("toString", () => {
    it("returns the move's name", () => {
      expect(move("tackle").toString()).toBe("Tackle");
    });
  });

  describe("toData", () => {
    it("summarizes the move for client display", () => {
      expect(move("tackle").toData()).toEqual({
        name: "Tackle",
        type: "Normal",
        desc: move("tackle").shortDesc,
        accuracy: "100",
        basePower: 40,
        category: "Physical",
      });
    });

    it("renders a never-miss move's accuracy as a dash", () => {
      expect(move("swordsdance").toData().accuracy).toBe("-");
    });
  });

  describe("accuracyPercent", () => {
    it("converts a numeric accuracy to a 0-1 fraction", () => {
      expect(move("thunderwave").accuracyPercent).toBeCloseTo(0.9);
    });

    it("treats accuracy: true as always-hit (1)", () => {
      expect(move("swordsdance").accuracyPercent).toBe(1);
    });
  });

  describe("expectedPower", () => {
    it("multiplies base power by the accuracy fraction", () => {
      expect(move("tackle").expectedPower).toBeCloseTo(40);
      // Hydro Pump: 110 base power, 80% accuracy.
      expect(move("hydropump").expectedPower).toBeCloseTo(88);
    });

    it("treats accuracy: true as always-hit when computing expected power", () => {
      // Aura Sphere: 80 base power, always-hit.
      expect(move("aurasphere").expectedPower).toBeCloseTo(80);
    });
  });

  describe("roleTags", () => {
    it("has no tags for a plain attack with no modifiers", () => {
      expect(move("tackle").roleTags).toEqual(new Set());
    });

    it("tags priority moves", () => {
      expect(move("quickattack").roleTags).toEqual(new Set(["Priority"]));
    });

    it("tags stat-boosting moves as Setup", () => {
      expect(move("swordsdance").roleTags).toEqual(new Set(["Setup"]));
    });

    it("tags forced-switch moves as Disruption", () => {
      expect(move("whirlwind").roleTags).toEqual(new Set(["Disruption"]));
    });

    it("tags self-switching moves as Momentum", () => {
      expect(move("voltswitch").roleTags).toEqual(new Set(["Momentum"]));
    });

    it("tags moves that directly inflict a status as Status", () => {
      expect(move("thunderwave").roleTags).toEqual(new Set(["Status"]));
    });

    it("tags weather-setting moves as Field Manipulation", () => {
      expect(move("raindance").roleTags).toEqual(new Set(["Field Manipulation"]));
    });

    it("tags a guaranteed negative-speed secondary as Speed Control", () => {
      expect(move("icywind").roleTags).toEqual(new Set(["Speed Control"]));
    });

    it("tags a high-chance status secondary as Status", () => {
      expect(move("nuzzle").roleTags).toEqual(new Set(["Status"]));
    });

    it("doesn't tag a low-chance status secondary as Status", () => {
      expect(move("thunderbolt").roleTags).toEqual(new Set());
    });

    it("pulls hardcoded tags from the curated move list", () => {
      expect(move("stealthrock").roleTags).toEqual(new Set(["Hazard Control"]));
      expect(move("tailwind").roleTags).toEqual(new Set(["Speed Control"]));
    });

    it("combines a curated tag with a derived tag when both apply", () => {
      expect(move("taunt").roleTags).toEqual(new Set(["Disruption"]));
    });
  });
});
