import { TransactionRunner } from "@core/database/transaction-runner";
import { TeamRepository } from "@modules/team/team.repository";
import { TournamentLogWriter } from "@modules/tournament-log/tournament-log.writer";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { HostedTournamentDocument } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Model } from "mongoose";
import { TierListAccessService } from "./tier-list-access.service";
import { TierListHistoryService } from "./tier-list-history.service";
import { TierListInviteRepository } from "./tier-list-invite.repository";
import { TierListRevisionRepository } from "./tier-list-revision.repository";
import {
  BANNED_TIER_NAME,
  Tier,
  TierList,
  TierListPokemon,
  UNTIERED_TIER_NAME,
} from "./tier-list.domain";
import { UpdateTierListDto, UpdateTierListSettingsDto } from "./tier-list.dto";
import { TierListMapper } from "./tier-list.mapper";
import { TierListRepository } from "./tier-list.repository";
import { TierListService } from "./tier-list.service";
import { tierId } from "./tier-list.test-ids";

function buildTierList(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: "tierlist-1",
    slug: "tierlist1",
    name: "Spring Tier List",
    description: "desc",
    createdBy: "auth0|owner",
    pokemon: new Map(),
    tiers: [],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    visibility: "public",
    ...overrides,
  });
}

function organizedBy(sub: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "tournament-1",
    slug: "spring-cup",
    leagueSlug: "league",
    name: "Spring Cup",
    owner: "auth0|league-owner",
    staff: [{ sub, role: "organizer", name: "Erika" }],
    tierListId: "tierlist-1",
    tierRequirements: [],
    signUpAccess: "open",
    completed: false,
    staffName: (who: string) => (who === sub ? "Erika" : null),
    ...overrides,
  } as unknown as HostedTournament;
}

describe("TierListService", () => {
  let tierListRepo: jest.Mocked<TierListRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let revisionRepo: jest.Mocked<TierListRevisionRepository>;
  let logWriter: jest.Mocked<TournamentLogWriter>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let service: TierListService;
  let tournamentModel: Model<HostedTournamentDocument>;

  beforeEach(() => {
    tierListRepo = {
      findById: jest.fn(),
      updateSettings: jest.fn(),
      saveContent: jest.fn().mockImplementation(async (_list, expected: number) => expected + 1),
    } as unknown as jest.Mocked<TierListRepository>;
    tierListRepo.updateSettings.mockImplementation(async () => buildTierList());
    tournamentRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    revisionRepo = {
      create: jest.fn().mockResolvedValue(undefined),
      find: jest.fn(),
    } as unknown as jest.Mocked<TierListRevisionRepository>;
    logWriter = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TournamentLogWriter>;
    teamRepo = {
      countApprovedByTournament: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<TeamRepository>;
    tournamentModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    } as unknown as Model<HostedTournamentDocument>;
    const access = new TierListAccessService(tierListRepo, tournamentRepo);
    service = new TierListService(
      tierListRepo,
      access,
      new TierListHistoryService(tierListRepo, revisionRepo),
      revisionRepo,
      {} as TierListInviteRepository,
      teamRepo,
      logWriter,
      { run: (work: () => Promise<unknown>) => work() } as TransactionRunner,
      tournamentModel,
    );
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
        tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Sparky", tierId: tierId("S") })],
        ]),
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      expect(result.ruleset).toBe("Gen9 NatDex");
      expect(result.name).toBe("Spring Tier List");
      expect(result.description).toBe("desc");
      expect(result.tierList).toEqual([
        {
          id: tierId("S"),
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
        tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
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
        tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
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
        tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
        ]),
        banned: { moves: ["flamethrower"], abilities: ["Levitate"] },
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      const pikachuView = result.tierList[0].pokemon[0] as any;
      expect(pikachuView.banned).toBeUndefined();
    });

    it("moves banned Pokemon out of their tier into a Banned bucket in view-only mode", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S"), banned: true })],
          ["raichu", new TierListPokemon({ name: "Raichu", tierId: tierId("S") })],
          [
            "bulbasaur",
            new TierListPokemon({ name: "Bulbasaur", tierId: undefined, banned: true }),
          ],
        ]),
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      const sTier = result.tierList.find((t) => t.name === "S")!;
      expect(sTier.pokemon.map((p) => p.id)).toEqual(["raichu"]);

      const bannedTier = result.tierList[0];
      expect(bannedTier.name).toBe(BANNED_TIER_NAME);
      expect(bannedTier.pokemon.map((p) => p.id).sort()).toEqual(["bulbasaur", "pikachu"]);
      expect(bannedTier.cost).toBeUndefined();
    });

    it("omits the Banned bucket in view-only mode when nothing is banned", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        pokemon: new Map([
          ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
        ]),
      });
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getTierList("tierlist-1", undefined, false);

      expect(result.tierList.find((t) => t.name === BANNED_TIER_NAME)).toBeUndefined();
    });

    it("includes addons only when present and non-empty", async () => {
      const tierList = buildTierList({
        tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        pokemon: new Map([
          [
            "pikachu",
            new TierListPokemon({
              name: "Pikachu",
              tierId: tierId("S"),
              addons: [{ name: "Light Ball", cost: 5 }],
            }),
          ],
          ["raichu", new TierListPokemon({ name: "Raichu", tierId: tierId("S") })],
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
          tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
          pokemon: new Map([
            ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
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

      it("keeps banned Pokemon in their stored tier flagged draftBanned, with no Banned bucket", async () => {
        const tierList = buildTierList({
          createdBy: "auth0|owner",
          tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
          pokemon: new Map([
            ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S"), banned: true })],
            ["raichu", new TierListPokemon({ name: "Raichu", tierId: tierId("S") })],
          ]),
        });
        tierListRepo.findById.mockResolvedValue(tierList);

        const result = await service.getTierList("tierlist-1", "auth0|owner", true);

        const views = result.tierList.find((t) => t.name === "S")!.pokemon as any[];
        expect(views.find((p) => p.id === "pikachu").draftBanned).toBe(true);
        expect(views.find((p) => p.id === "raichu").draftBanned).toBeUndefined();
        expect(result.tierList.find((t) => t.name === BANNED_TIER_NAME)).toBeUndefined();
      });

      it("marks a tracked-but-unassigned (e.g. previously banned-while-Untiered) Pokemon as draftBanned in the Untiered bucket", async () => {
        const tierList = buildTierList({
          createdBy: "auth0|owner",
          tiers: [],
          pokemon: new Map([
            [
              "pikachu",
              new TierListPokemon({ name: "Pikachu", tierId: undefined, banned: true }),
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
        const tierList = buildTierList({ tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })] });
        tierListRepo.findById.mockResolvedValue(tierList);

        const result = await service.getTierList("tierlist-1", undefined, false);

        expect(result.tierList.find((t) => t.name === UNTIERED_TIER_NAME)).toBeUndefined();
      });
    });
  });

  describe("visibility", () => {
    it("hides a private list from strangers as if it didn't exist", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ visibility: "private" }));

      await expect(
        service.getTierList("tierlist-1", "auth0|stranger", false),
      ).rejects.toMatchObject({ code: "LR-TIER-001" });
    });

    it("shows a private list to a viewer it was shared with", async () => {
      tierListRepo.findById.mockResolvedValue(
        buildTierList({
          visibility: "private",
          members: [{ sub: "auth0|friend", role: "viewer" }],
        }),
      );

      const result = await service.getTierList("tierlist-1", "auth0|friend", false);

      expect(result.meta.access).toBe("view");
      expect(result.meta.role).toBe("viewer");
    });

    it("lets organizers edit their tournament's copy, and nobody else", async () => {
      const copy = buildTierList({ tournamentId: "tournament-1", createdBy: "auth0|creator" });
      tierListRepo.findById.mockResolvedValue(copy);
      tournamentRepo.findById.mockResolvedValue(organizedBy("auth0|organizer"));

      await expect(
        service.getTierList("tierlist-1", "auth0|organizer", true),
      ).resolves.toBeDefined();
      await expect(
        service.getTierList("tierlist-1", "auth0|creator", true),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
    });

    it("freezes a tournament's copy once it is replaced", async () => {
      tierListRepo.findById.mockResolvedValue(
        buildTierList({ tournamentId: "tournament-1", retiredAt: new Date() }),
      );
      tournamentRepo.findById.mockResolvedValue(organizedBy("auth0|organizer"));

      await expect(
        service.getTierList("tierlist-1", "auth0|organizer", true),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
    });
  });

  describe("getSettings", () => {
    it("returns the settings with the viewer's access", async () => {
      const tierList = buildTierList();
      tierListRepo.findById.mockResolvedValue(tierList);

      const result = await service.getSettings("tierlist-1", "auth0|owner");

      expect(tierListRepo.findById).toHaveBeenCalledWith("tierlist-1");
      expect(result).toEqual({
        ...TierListMapper.toSettingsPayload(tierList),
        access: "manage",
      });
    });
  });

  describe("updateSettings", () => {
    it("throws FORBIDDEN when the caller can't edit", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ createdBy: "auth0|owner" }));

      await expect(
        service.updateSettings("tierlist-1", "auth0|stranger", {} as UpdateTierListSettingsDto),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
      expect(tierListRepo.updateSettings).not.toHaveBeenCalled();
    });

    it("only includes explicitly provided fields in the update", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ createdBy: "auth0|owner" }));

      const result = await service.updateSettings("tierlist-1", "auth0|owner", {
        name: "New Name",
      } as UpdateTierListSettingsDto);

      expect(tierListRepo.updateSettings).toHaveBeenCalledWith("tierlist-1", {
        name: "New Name",
      });
      expect(result.message).toBe("Tier list settings saved.");
    });

    it("lets an editor rename but not reshare the list", async () => {
      tierListRepo.findById.mockResolvedValue(
        buildTierList({ members: [{ sub: "auth0|editor", role: "editor" }] }),
      );

      await service.updateSettings("tierlist-1", "auth0|editor", {
        name: "Renamed",
      } as UpdateTierListSettingsDto);
      await expect(
        service.updateSettings("tierlist-1", "auth0|editor", {
          visibility: "private",
        } as UpdateTierListSettingsDto),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
    });

    it("asks for an author name before a list is shared", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ visibility: "private" }));

      await expect(
        service.updateSettings("tierlist-1", "auth0|owner", {
          visibility: "public",
        } as UpdateTierListSettingsDto),
      ).rejects.toMatchObject({ code: "LR-TIER-002" });

      await service.updateSettings("tierlist-1", "auth0|owner", {
        visibility: "public",
        authorName: "Brock",
      } as UpdateTierListSettingsDto);
      expect(tierListRepo.updateSettings).toHaveBeenCalledWith("tierlist-1", {
        authorName: "Brock",
        visibility: "public",
      });
    });

    it("keeps sharing settings off a tournament's copy", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ tournamentId: "tournament-1" }));
      tournamentRepo.findById.mockResolvedValue(organizedBy("auth0|organizer"));

      await expect(
        service.updateSettings("tierlist-1", "auth0|organizer", {
          visibility: "public",
        } as UpdateTierListSettingsDto),
      ).rejects.toMatchObject({ code: "LR-TIER-008" });
    });
  });

  describe("updateTierList", () => {
    it("throws FORBIDDEN when the caller can't edit", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ createdBy: "auth0|owner" }));

      await expect(
        service.updateTierList("tierlist-1", "auth0|stranger", { tiers: [] } as UpdateTierListDto),
      ).rejects.toMatchObject({ code: "LR-TIER-004" });
      expect(tierListRepo.saveContent).not.toHaveBeenCalled();
    });

    it("saves the change and records a revision with a summary", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ version: 4 }));
      const dto = {
        tiers: [
          { name: "S", cost: 30, pokemon: [{ id: "garchomp", name: "Garchomp" }] },
        ],
        version: 4,
      } as UpdateTierListDto;

      const result = await service.updateTierList("tierlist-1", "auth0|owner", dto);

      expect(tierListRepo.saveContent).toHaveBeenCalledWith(expect.any(TierList), 4);
      expect(result.version).toBe(5);
      expect(result.summary).toBe("Added 1 Pokémon, added tier S");
      expect(revisionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 5,
          actor: "auth0|owner",
          kind: "edit",
          summary: "Added 1 Pokémon, added tier S",
        }),
      );
    });

    it("refuses a save that started from an older version", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ version: 6 }));

      await expect(
        service.updateTierList("tierlist-1", "auth0|owner", {
          tiers: [{ name: "S", cost: 30, pokemon: [] }],
          version: 5,
        } as UpdateTierListDto),
      ).rejects.toMatchObject({ code: "LR-TIER-005" });
      expect(tierListRepo.saveContent).not.toHaveBeenCalled();
    });

    it("keeps the state before history started as version 0", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ version: 0 }));

      await service.updateTierList("tierlist-1", "auth0|owner", {
        tiers: [{ name: "S", cost: 30, pokemon: [] }],
      } as UpdateTierListDto);

      expect(revisionRepo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ version: 0, summary: "Before history started" }),
      );
      expect(revisionRepo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ version: 1 }),
      );
    });

    it("writes nothing when the save changes nothing", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ version: 2 }));

      const result = await service.updateTierList("tierlist-1", "auth0|owner", {
        tiers: [],
      } as unknown as UpdateTierListDto);

      expect(result.version).toBe(2);
      expect(tierListRepo.saveContent).not.toHaveBeenCalled();
      expect(revisionRepo.create).not.toHaveBeenCalled();
    });

    it("logs an organizer's edit to a live tournament's list", async () => {
      tierListRepo.findById.mockResolvedValue(
        buildTierList({
          tournamentId: "tournament-1",
          tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
          version: 3,
        }),
      );
      tournamentRepo.findById.mockResolvedValue(organizedBy("auth0|organizer"));

      await service.updateTierList("tierlist-1", "auth0|organizer", {
        tiers: [{ id: tierId("S"), name: "S", cost: 25, pokemon: [] }],
        version: 3,
        reason: "Fixing a typo",
      } as UpdateTierListDto);

      expect(logWriter.record).toHaveBeenCalledWith(
        expect.objectContaining({ id: "tournament-1" }),
        "auth0|organizer",
        expect.objectContaining({
          type: "tier-list.edited",
          summary: "Repriced S 30 → 25",
          reason: "Fixing a typo",
        }),
      );
      expect(revisionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorName: "Erika" }),
      );
    });

    it("doesn't log edits before sign-ups open", async () => {
      tierListRepo.findById.mockResolvedValue(
        buildTierList({
          tournamentId: "tournament-1",
          tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        }),
      );
      tournamentRepo.findById.mockResolvedValue(
        organizedBy("auth0|organizer", { signUpAccess: "closed" }),
      );

      await service.updateTierList("tierlist-1", "auth0|organizer", {
        tiers: [{ id: tierId("S"), name: "S", cost: 25, pokemon: [] }],
      } as UpdateTierListDto);

      expect(logWriter.record).not.toHaveBeenCalled();
    });

    it("reports requirements left pointing at a deleted tier", async () => {
      tierListRepo.findById.mockResolvedValue(
        buildTierList({
          tournamentId: "tournament-1",
          tiers: [new Tier({ id: tierId("S"), name: "S", cost: 30 })],
        }),
      );
      tournamentRepo.findById.mockResolvedValue(
        organizedBy("auth0|organizer", {
          tierRequirements: [{ tierId: tierId("S"), required: 2 }],
        }),
      );

      const result = await service.updateTierList("tierlist-1", "auth0|organizer", {
        tiers: [],
      } as unknown as UpdateTierListDto);

      expect(result.orphanedRequirements).toEqual([
        { tournament: "Spring Cup", requirements: 1 },
      ]);
    });
  });

  describe("revert", () => {
    it("restores an old version as a new revision", async () => {
      tierListRepo.findById.mockResolvedValue(
        buildTierList({ version: 5, tiers: [new Tier({ id: tierId("A"), name: "A", cost: 10 })] }),
      );
      revisionRepo.find.mockResolvedValue({
        version: 2,
        state: {
          tiers: [{ id: tierId("S"), name: "S", cost: 30 }],
          pokemon: {},
          banned: { moves: [], abilities: [] },
        },
      } as never);

      const result = await service.revert("tierlist-1", "auth0|owner", 2, 5);

      expect(result.version).toBe(6);
      expect(revisionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "revert", restoredFrom: 2, version: 6 }),
      );
    });
  });

  describe("remove", () => {
    it("refuses to delete a tournament's copy", async () => {
      tierListRepo.findById.mockResolvedValue(buildTierList({ tournamentId: "tournament-1" }));
      tournamentRepo.findById.mockResolvedValue(organizedBy("auth0|owner"));

      await expect(service.remove("tierlist-1", "auth0|owner")).rejects.toMatchObject({
        code: "LR-TIER-008",
      });
    });
  });
});
