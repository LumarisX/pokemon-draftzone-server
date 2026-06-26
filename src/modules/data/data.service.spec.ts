import { DataRepository } from "./data.repository";
import { DataService } from "./data.service";
import { PokemonDataMapper } from "./pokemon-data.mapper";

jest.mock("./pokemon-data.mapper", () => ({
  PokemonDataMapper: {
    toDto: jest.fn(),
    toRandomDto: jest.fn(),
    toFormeDto: jest.fn(),
  },
}));

const mockedMapper = PokemonDataMapper as jest.Mocked<typeof PokemonDataMapper>;

describe("DataService", () => {
  let repository: jest.Mocked<DataRepository>;
  let service: DataService;

  beforeEach(() => {
    repository = {
      getFormats: jest.fn(),
      getFormatsLegacy: jest.fn(),
      getRulesets: jest.fn(),
      getRulesetsLegacy: jest.fn(),
      getSpeciesForRuleset: jest.fn(),
      getRandomSpecies: jest.fn(),
      getMovesForPokemon: jest.fn(),
      getFormesForPokemon: jest.fn(),
    } as unknown as jest.Mocked<DataRepository>;
    service = new DataService(repository);
  });

  it("getFormats delegates to the repository", async () => {
    const formats = [["Singles", [{ name: "Standard", id: "Singles" }]]];
    repository.getFormats.mockReturnValue(formats as any);

    await expect(service.getFormats()).resolves.toBe(formats);
  });

  it("getFormatsLegacy delegates to the repository", async () => {
    const formats = ["Singles", "VGC"];
    repository.getFormatsLegacy.mockReturnValue(formats);

    await expect(service.getFormatsLegacy()).resolves.toBe(formats);
  });

  it("getRulesets delegates to the repository", async () => {
    const rulesets = [["Gen 9", [{ name: "National Dex", id: "Gen9 NatDex" }]]];
    repository.getRulesets.mockReturnValue(rulesets as any);

    await expect(service.getRulesets()).resolves.toBe(rulesets);
  });

  it("getRulesetsLegacy delegates to the repository", async () => {
    const rulesets = ["Gen9 NatDex", "Paldea Dex"];
    repository.getRulesetsLegacy.mockReturnValue(rulesets);

    await expect(service.getRulesetsLegacy()).resolves.toBe(rulesets);
  });

  describe("getPokemonList", () => {
    it("fetches the species for the ruleset and maps each one to a DTO", async () => {
      const pikachu = { id: "pikachu" } as any;
      const charizard = { id: "charizard" } as any;
      repository.getSpeciesForRuleset.mockReturnValue([pikachu, charizard]);
      mockedMapper.toDto
        .mockResolvedValueOnce({ id: "pikachu" } as any)
        .mockResolvedValueOnce({ id: "charizard" } as any);

      const result = await service.getPokemonList("Gen9 NatDex");

      expect(repository.getSpeciesForRuleset).toHaveBeenCalledWith("Gen9 NatDex");
      expect(mockedMapper.toDto).toHaveBeenCalledWith(pikachu);
      expect(mockedMapper.toDto).toHaveBeenCalledWith(charizard);
      expect(result).toEqual([{ id: "pikachu" }, { id: "charizard" }]);
    });

    it("returns an empty array when the ruleset has no species", async () => {
      repository.getSpeciesForRuleset.mockReturnValue([]);

      const result = await service.getPokemonList("Gen9 NatDex");

      expect(result).toEqual([]);
      expect(mockedMapper.toDto).not.toHaveBeenCalled();
    });
  });

  describe("getRandomPokemon", () => {
    it("fetches a random sample from the repository and maps it with the format's level", async () => {
      const pikachu = { id: "pikachu" } as any;
      repository.getRandomSpecies.mockReturnValue([pikachu]);
      mockedMapper.toRandomDto.mockReturnValue({ id: "pikachu" } as any);

      const result = await service.getRandomPokemon(
        "Gen9 NatDex",
        5,
        "Singles",
        { tier: "S", banned: ["mewtwo"] },
      );

      expect(repository.getRandomSpecies).toHaveBeenCalledWith(
        "Gen9 NatDex",
        5,
        { tier: "S", banned: ["mewtwo"] },
      );
      expect(mockedMapper.toRandomDto).toHaveBeenCalledWith(pikachu, 100);
      expect(result).toEqual([{ id: "pikachu" }]);
    });

    it("throws for an unknown format id", async () => {
      repository.getRandomSpecies.mockReturnValue([]);

      await expect(
        service.getRandomPokemon("Gen9 NatDex", 5, "NotAFormat"),
      ).rejects.toThrow();
    });
  });

  describe("getPokemonMoves", () => {
    it("fetches the learnset and maps each move to the slim move DTO shape", async () => {
      const thunderbolt = {
        id: "thunderbolt",
        name: "Thunderbolt",
        type: "Electric",
        category: "Special",
        basePower: 90,
        accuracy: 100,
        pp: 15,
        priority: 0,
        target: "normal",
      } as any;
      repository.getMovesForPokemon.mockResolvedValue([thunderbolt]);

      const result = await service.getPokemonMoves("Gen9 NatDex", "pikachu");

      expect(repository.getMovesForPokemon).toHaveBeenCalledWith(
        "Gen9 NatDex",
        "pikachu",
      );
      expect(result).toEqual([
        {
          id: "thunderbolt",
          name: "Thunderbolt",
          type: "Electric",
          category: "Special",
          basePower: 90,
          accuracy: 100,
          pp: 15,
          priority: 0,
          target: "normal",
        },
      ]);
    });
  });

  describe("getPokemonFormes", () => {
    it("fetches sibling formes and maps each to the slim forme DTO shape", async () => {
      const megaVenusaur = { id: "venusaurmega" } as any;
      repository.getFormesForPokemon.mockReturnValue([megaVenusaur]);
      mockedMapper.toFormeDto.mockReturnValue({
        id: "venusaurmega",
        name: "Venusaur-Mega",
      });

      const result = await service.getPokemonFormes("Gen9 NatDex", "venusaur");

      expect(repository.getFormesForPokemon).toHaveBeenCalledWith(
        "Gen9 NatDex",
        "venusaur",
      );
      expect(mockedMapper.toFormeDto).toHaveBeenCalledWith(megaVenusaur);
      expect(result).toEqual([{ id: "venusaurmega", name: "Venusaur-Mega" }]);
    });
  });
});
