import { getRuleset } from "../../data/rulesets";
import { getName } from "./pokedex.service";

jest.mock("../../data/rulesets", () => ({
  getRuleset: jest.fn(),
}));

describe("Pokedex Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getName", () => {
    it("should return the name of a valid pokemon ID", () => {
      const mockSpeciesGet = jest.fn().mockReturnValue({ name: "Pikachu" });
      (getRuleset as jest.Mock).mockReturnValue({
        species: {
          get: mockSpeciesGet,
        },
      });

      const result = getName("pikachu");
      expect(result).toBe("Pikachu");
      expect(getRuleset).toHaveBeenCalledWith("Gen9 NatDex");
      expect(mockSpeciesGet).toHaveBeenCalledWith("pikachu");
    });

    it("should return an empty string for an invalid pokemon ID", () => {
      const mockSpeciesGet = jest.fn().mockReturnValue(undefined);
      (getRuleset as jest.Mock).mockReturnValue({
        species: {
          get: mockSpeciesGet,
        },
      });

      const result = getName("invalidpokemon");
      expect(result).toBe("");
      expect(getRuleset).toHaveBeenCalledWith("Gen9 NatDex");
      expect(mockSpeciesGet).toHaveBeenCalledWith("invalidpokemon");
    });
  });
});
