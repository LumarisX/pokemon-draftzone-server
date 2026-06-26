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
});
