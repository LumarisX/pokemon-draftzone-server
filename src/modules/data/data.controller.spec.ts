import { DataController } from "./data.controller";
import { DataService } from "./data.service";

describe("DataController", () => {
  let service: jest.Mocked<DataService>;
  let controller: DataController;

  beforeEach(() => {
    service = {
      getFormats: jest.fn(),
      getFormatsLegacy: jest.fn(),
      getRulesets: jest.fn(),
      getRulesetsLegacy: jest.fn(),
      getPokemonList: jest.fn(),
      getRandomPokemon: jest.fn(),
      getPokemonMoves: jest.fn(),
      getPokemonFormes: jest.fn(),
    } as unknown as jest.Mocked<DataService>;
    controller = new DataController(service);
  });

  it("getFormats delegates to the service", async () => {
    const formats = [["Singles", []]] as any;
    service.getFormats.mockResolvedValue(formats);

    await expect(controller.getFormats()).resolves.toBe(formats);
  });

  it("getFormatsLegacy delegates to the service", async () => {
    const formats = ["Singles"];
    service.getFormatsLegacy.mockResolvedValue(formats);

    await expect(controller.getFormatsLegacy()).resolves.toBe(formats);
  });

  it("getRulesets delegates to the service", async () => {
    const rulesets = [["Gen 9", []]] as any;
    service.getRulesets.mockResolvedValue(rulesets);

    await expect(controller.getRulesets()).resolves.toBe(rulesets);
  });

  it("getRulesetsLegacy delegates to the service", async () => {
    const rulesets = ["Gen9 NatDex"];
    service.getRulesetsLegacy.mockResolvedValue(rulesets);

    await expect(controller.getRulesetsLegacy()).resolves.toBe(rulesets);
  });

  it("getPokemonList forwards the ruleset query param to the service", async () => {
    const pokemonList = [{ id: "pikachu" }] as any;
    service.getPokemonList.mockResolvedValue(pokemonList);

    const result = await controller.getPokemonList("Gen9 NatDex");

    expect(service.getPokemonList).toHaveBeenCalledWith("Gen9 NatDex");
    expect(result).toBe(pokemonList);
  });

  describe("getRandom", () => {
    it("parses count and forwards a tier/banned list to the service", async () => {
      const pokemon = [{ id: "pikachu" }] as any;
      service.getRandomPokemon.mockResolvedValue(pokemon);

      const result = await controller.getRandom(
        "5",
        "Gen9 NatDex",
        "Singles",
        "S",
        ["mewtwo", "arceus"],
      );

      expect(service.getRandomPokemon).toHaveBeenCalledWith(
        "Gen9 NatDex",
        5,
        "Singles",
        { tier: "S", banned: ["mewtwo", "arceus"] },
      );
      expect(result).toBe(pokemon);
    });

    it("normalizes a single banned id (string) into a one-item array", async () => {
      service.getRandomPokemon.mockResolvedValue([]);

      await controller.getRandom("3", "Gen9 NatDex", "Singles", undefined, "mewtwo");

      expect(service.getRandomPokemon).toHaveBeenCalledWith(
        "Gen9 NatDex",
        3,
        "Singles",
        { tier: undefined, banned: ["mewtwo"] },
      );
    });

    it("clamps count to a minimum of 1 when missing or invalid", async () => {
      service.getRandomPokemon.mockResolvedValue([]);

      await controller.getRandom("not-a-number", "Gen9 NatDex", "Singles");

      expect(service.getRandomPokemon).toHaveBeenCalledWith(
        "Gen9 NatDex",
        1,
        "Singles",
        { tier: undefined, banned: [] },
      );
    });

    it("throws when ruleset is missing", async () => {
      await expect(
        controller.getRandom("5", undefined, "Singles"),
      ).rejects.toThrow();
    });

    it("throws when format is missing", async () => {
      await expect(
        controller.getRandom("5", "Gen9 NatDex", undefined),
      ).rejects.toThrow();
    });
  });

  describe("getPokemonMoves", () => {
    it("forwards pokemonId and the ruleset query param to the service", async () => {
      const moves = [{ id: "thunderbolt" }] as any;
      service.getPokemonMoves.mockResolvedValue(moves);

      const result = await controller.getPokemonMoves(
        "pikachu",
        "Gen9 NatDex",
      );

      expect(service.getPokemonMoves).toHaveBeenCalledWith(
        "Gen9 NatDex",
        "pikachu",
      );
      expect(result).toBe(moves);
    });

    it("throws when ruleset is missing", async () => {
      await expect(controller.getPokemonMoves("pikachu", undefined)).rejects.toThrow();
    });
  });

  describe("getFormes", () => {
    it("forwards pokemonId and the ruleset query param to the service", async () => {
      const formes = [{ id: "venusaurmega" }] as any;
      service.getPokemonFormes.mockResolvedValue(formes);

      const result = await controller.getFormes("venusaur", "Gen9 NatDex");

      expect(service.getPokemonFormes).toHaveBeenCalledWith(
        "Gen9 NatDex",
        "venusaur",
      );
      expect(result).toBe(formes);
    });

    it("throws when ruleset is missing", async () => {
      await expect(controller.getFormes("venusaur", undefined)).rejects.toThrow();
    });
  });
});
