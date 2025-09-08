import { ID, Move, MoveName } from "@pkmn/data";
import { getEffectivePower } from "./move.service";

describe("Move Service", () => {
  describe("getEffectivePower", () => {
    it("should return basePower when accuracy is true", () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: {},
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(100);
    });

    it("should calculate power based on accuracy when accuracy is a number", () => {
      const mockMove: Move = {
        accuracy: 80,
        basePower: 100,
        flags: {},
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(80);
    });

    it('should halve power if "charge" flag is present', () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: { charge: 1 },
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(50);
    });

    it('should halve power if "recharge" flag is present', () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: { recharge: 1 },
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(50);
    });

    it("should divide power by 4 if condition duration is 1", () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: {},
        condition: { duration: 1 },
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(25);
    });

    it("should divide power by 2 if condition duration is greater than 1", () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: {},
        condition: { duration: 2 },
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(50);
    });

    it('should halve power if self.volatileStatus is "lockedmove"', () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: {},
        self: { volatileStatus: "lockedmove" },
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(50);
    });

    it('should return 1 if id is "steelroller"', () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: {},
        id: "steelroller" as ID,
        name: "Steel Roller" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Steel",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(1);
    });

    it("should return 1 if selfdestruct is defined", () => {
      const mockMove: Move = {
        accuracy: true,
        basePower: 100,
        flags: {},
        selfdestruct: "always",
        id: "testmove" as ID,
        name: "Test Move" as MoveName,
        category: "Physical",
        pp: 10,
        priority: 0,
        target: "normal",
        type: "Normal",
        effectType: "Move",
        kind: "Move",
        secondaries: null,
        isZ: false,
        isMax: false,
        fullname: "",
        exists: false,
        num: 0,
        gen: 1,
        shortDesc: "",
        desc: "",
        isNonstandard: null,
      };
      expect(getEffectivePower(mockMove)).toBe(1);
    });
  });
});
