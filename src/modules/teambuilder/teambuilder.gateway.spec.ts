import { TeambuilderGateway } from "./teambuilder.gateway";
import { TeambuilderService } from "./teambuilder.service";

describe("TeambuilderGateway", () => {
  let service: jest.Mocked<TeambuilderService>;
  let gateway: TeambuilderGateway;

  beforeEach(() => {
    service = {
      shouldHighlightMove: jest.fn(),
      shouldHighlightItem: jest.fn(),
      getModifiedMove: jest.fn(),
      getModifiedType: jest.fn(),
      getProcessedLearnset: jest.fn(),
    } as unknown as jest.Mocked<TeambuilderService>;
    gateway = new TeambuilderGateway(service);
  });

  it("shouldHighlightMove forwards the message body to the service", () => {
    const data = { ability: "Adaptability", move: {} } as any;
    service.shouldHighlightMove.mockReturnValue(true);

    const result = gateway.shouldHighlightMove(data);

    expect(service.shouldHighlightMove).toHaveBeenCalledWith(data);
    expect(result).toBe(true);
  });

  it("shouldHighlightItem forwards the message body to the service", () => {
    const data = { ability: "Levitate", item: {} } as any;
    service.shouldHighlightItem.mockReturnValue(false);

    const result = gateway.shouldHighlightItem(data);

    expect(service.shouldHighlightItem).toHaveBeenCalledWith(data);
    expect(result).toBe(false);
  });

  it("getModifiedMove forwards the message body to the service", () => {
    const data = { ability: "Levitate", move: {} } as any;
    service.getModifiedMove.mockReturnValue(undefined);

    const result = gateway.getModifiedMove(data);

    expect(service.getModifiedMove).toHaveBeenCalledWith(data);
    expect(result).toBeUndefined();
  });

  it("getModifiedType forwards the message body to the service", () => {
    const data = { move: {}, pokemon: {} } as any;
    service.getModifiedType.mockReturnValue(undefined);

    const result = gateway.getModifiedType(data);

    expect(service.getModifiedType).toHaveBeenCalledWith(data);
    expect(result).toBeUndefined();
  });

  it("getProcessedLearnset forwards the message body to the service", async () => {
    const data = { pokemon: { id: "pikachu" }, ruleset: "Gen9 NatDex" } as any;
    const learnset = [{ id: "thunderbolt" }] as any;
    service.getProcessedLearnset.mockResolvedValue(learnset);

    const result = await gateway.getProcessedLearnset(data);

    expect(service.getProcessedLearnset).toHaveBeenCalledWith(data);
    expect(result).toBe(learnset);
  });
});
