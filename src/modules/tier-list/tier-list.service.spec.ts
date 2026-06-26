import { UNTIERED_TIER_NAME } from "./tier-list.domain";
import { Tier, TierList, TierListPokemon } from "./tier-list.domain";
import { UpdateTierListDto, UpdateTierListSettingsDto } from "./tier-list.dto";
import { TierListMapper } from "./tier-list.mapper";
import { TierListRepository } from "./tier-list.repository";
import { TierListService } from "./tier-list.service";

function buildTierList(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: "tierlist-1",
    name: "Spring Tier List",
    description: "desc",
    createdBy: "auth0|owner",
    pokemon: new Map(),
    tiers: [],
    banned: { moves: [], abilities: [] },
    draftCount: { min: 1, max: 6 },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

describe("TierListService", () => {
  let tierListRepo: jest.Mocked<TierListRepository>;
  let service: TierListService;

  beforeEach(() => {
    tierListRepo = {
      findById: jest.fn(),
      updateSettings: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<TierListRepository>;
    service = new TierListService(tierListRepo);
  });

  describe("getTierList", () => {
    it("throws FORBIDDEN when editing and the caller can't edit", async () => {
      const tierList = buildTierList({ createdBy: "auth0|owner" });
      tierListRepo.findById.mockResolvedValue(tierList);

      await expect(
        service.getTierList("tierlist-1", "auth0|stranger", true),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
    });

    it("doesn't check edit permission in view-only mode", async () => {
      const tierList = buildTierList({ createdBy: "auth0|owner" });
      tierListRepo.findById.mockResolvedValue(tierList);

      await expect(
        service.getTierList("tierlist-1", "auth0|stranger", false),
      ).resolves.toBeDefined();
    });

    it("assembles the tier list view with tiered Pokemon mapped to their stored display name", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Sparky", tier: "S" })],
        ]),
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      expect(result.ruleset).toBe("Gen9 NatDex");
      expect(result.name).toBe("Spring Tier List");
      expect(result.description).toBe("desc");
      expect(result.draftCount).toEqual({ min: 1, max: 6 });
      expect(result.divisions).toEqual({});
      expect(result.tierList).toEqual([
        {
          name: "S",
          cost: 30,
          pokemon: [
            expect.objectContaining({ id: "pikachu", name: "Sparky" }),
          ],
        },
      ]);
    });

    it("filters banned moves down to ones the Pokemon can actually learn", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
        ]),
        banned: { moves: ["thunderbolt", "flamethrower"], abilities: [] },
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      const pikachuView = result.tierList[0].pokemon[0] as any;
      expect(pikachuView.banned.moves).toEqual(["thunderbolt"]);
    });

    it("filters banned abilities down to ones the Pokemon actually has", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
        ]),
        banned: { moves: [], abilities: ["Lightning Rod", "Levitate"] },
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      const pikachuView = result.tierList[0].pokemon[0] as any;
      expect(pikachuView.banned.abilities).toEqual(["Lightning Rod"]);
    });

    it("omits the banned field entirely when no banned move/ability applies", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
        ]),
        banned: { moves: ["flamethrower"], abilities: ["Levitate"] },
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      const pikachuView = result.tierList[0].pokemon[0] as any;
      expect(pikachuView.banned).toBeUndefined();
    });

    it("includes draftBanned only when the Pokemon is marked banned", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S", banned: true })],
          ["raichu", new TierListPokemon({ name: "Raichu", tier: "S" })],
        ]),
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      const views = result.tierList[0].pokemon as any[];
      expect(views.find((p) => p.id === "pikachu").draftBanned).toBe(true);
      expect(views.find((p) => p.id === "raichu").draftBanned).toBeUndefined();
    });

    it("includes addons only when present and non-empty", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ name: "S", cost: 30 })],
        pokemon: new Map([
          [
            "pikachu",
            new TierListPokemon({
              name: "Pikachu",
              tier: "S",
              addons: [{ name: "Light Ball", cost: 5 }],
            }),
          ],
          ["raichu", new TierListPokemon({ name: "Raichu", tier: "S" })],
        ]),
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      const views = result.tierList[0].pokemon as any[];
      expect(views.find((p) => p.id === "pikachu").addons).toEqual([
        { name: "Light Ball", cost: 5 },
      ]);
      expect(views.find((p) => p.id === "raichu").addons).toBeUndefined();
    });

    describe("edit mode (showAll)", () => {
      it("appends an Untiered bucket containing every species not assigned to a named tier", async () => {
        const tierList = buildTierList({
          createdBy: "auth0|owner",
          tiers: [new Tier({ name: "S", cost: 30 })],
          pokemon: new Map([
            ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
          ]),
        });
        tierListRepo.findById.mockResolvedValue(tierList);

        const result = await service.getTierList("tierlist-1", "auth0|owner", true);

        const untieredTier = result.tierList.find((t) => t.name === UNTIERED_TIER_NAME);
        expect(untieredTier).toBeDefined();
        expect(untieredTier!.cost).toBeUndefined();
        const untieredIds = untieredTier!.pokemon.map((p) => p.id);
        expect(untieredIds).not.toContain("pikachu");
        expect(untieredIds).toContain("bulbasaur");
      });

      it("marks a tracked-but-unassigned (e.g. previously banned-while-Untiered) Pokemon as draftBanned in the Untiered bucket", async () => {
        const tierList = buildTierList({
          createdBy: "auth0|owner",
          tiers: [],
          pokemon: new Map([
            [
              "pikachu",
              new TierListPokemon({ name: "Pikachu", tier: UNTIERED_TIER_NAME, banned: true }),
            ],
          ]),
        });
        tierListRepo.findById.mockResolvedValue(tierList);

        const result = await service.getTierList("tierlist-1", "auth0|owner", true);

        const untieredTier = result.tierList.find((t) => t.name === UNTIERED_TIER_NAME)!;
        const pikachuView = untieredTier.pokemon.find((p) => p.id === "pikachu") as any;
        expect(pikachuView.draftBanned).toBe(true);
      });

      it("doesn't append an Untiered bucket in view-only mode", async () => {
        const tierList = buildTierList({ tiers: [new Tier({ name: "S", cost: 30 })] });
        tierListRepo.findById.mockResolvedValue(tierList);

        const result = await service.getTierList("tierlist-1", undefined, false);

        expect(result.tierList.find((t) => t.name === UNTIERED_TIER_NAME)).toBeUndefined();
      });
    });
  });

  describe("getSettings", () => {
    it("delegates to the repository and mapper", async () => {
      const tierList = buildTierList();
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getSettings("tierlist-1");

      expect(tierListRepo.findById).toHaveBeenCalledWith("tierlist-1");
      expect(result).toEqual(TierListMapper.toSettingsPayload(tierList));
    });
  });

  describe("updateSettings", () => {
    it("throws FORBIDDEN when the caller can't edit", async () => {
      const tierList = buildTierList({ createdBy: "auth0|owner" });
      tierListRepo.findById.mockResolvedValue(tierList);

      await expect(
        service.updateSettings("tierlist-1", "auth0|stranger", {} as UpdateTierListSettingsDto),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
      expect(tierListRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("only includes explicitly provided fields in the update", async () => {
      const tierList = buildTierList({ createdBy: "auth0|owner" });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.updateSettings("tierlist-1", "auth0|owner", {
        name: "New Name",
      } as UpdateTierListSettingsDto);

      expect(tierListRepo.updateSettings).toHaveBeenCalledWith("tierlist-1", {
        name: "New Name",
      });
      expect(result).toEqual({ success: true });
    });

    it("includes multiple provided fields together", async () => {
      const tierList = buildTierList({ createdBy: "auth0|owner" });
      tierListRepo.findById.mockResolvedValue(tierList);

      await service.updateSettings("tierlist-1", "auth0|owner", {
        name: "New Name",
        pointTotal: 120,
      } as UpdateTierListSettingsDto);

      expect(tierListRepo.updateSettings).toHaveBeenCalledWith("tierlist-1", {
        name: "New Name",
        pointTotal: 120,
      });
    });
  });

  describe("updateTierList", () => {
    it("throws FORBIDDEN when the caller can't edit", async () => {
      const tierList = buildTierList({ createdBy: "auth0|owner" });
      tierListRepo.findById.mockResolvedValue(tierList);

      await expect(
        service.updateTierList("tierlist-1", "auth0|stranger", { tiers: [] } as UpdateTierListDto),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
      expect(tierListRepo.save).not.toHaveBeenCalled();
    });

    it("applies the update to the domain object and persists it", async () => {
      const tierList = buildTierList({ createdBy: "auth0|owner" });
      const applySpy = jest.spyOn(tierList, "applyTierUpdate");
      tierListRepo.findById.mockResolvedValue(tierList);
      const dto = { tiers: [{ name: "S", cost: 30, pokemon: [] }] } as UpdateTierListDto;

      const result = await service.updateTierList("tierlist-1", "auth0|owner", dto);

      expect(applySpy).toHaveBeenCalledWith(dto.tiers);
      expect(tierListRepo.save).toHaveBeenCalledWith(tierList);
      expect(result).toEqual({
        success: true,
        message: "Tier list updated successfully",
      });
    });
  });
});
