import { Types } from "mongoose";
import { TierListAccessService } from "./tier-list-access.service";
import { TierListInviteRepository } from "./tier-list-invite.repository";
import {
  hashToken,
  memberId,
  TierListSharingService,
} from "./tier-list-sharing.service";
import { TierList } from "./tier-list.domain";
import { TierListRepository } from "./tier-list.repository";

function list(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: new Types.ObjectId().toString(),
    slug: "list",
    name: "Spring List",
    createdBy: "auth0|owner",
    authorName: "Brock",
    pokemon: new Map(),
    tiers: [],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    visibility: "private",
    members: [{ sub: "auth0|editor", name: "Misty", role: "editor" }],
    ...overrides,
  });
}

describe("TierListSharingService", () => {
  let tierListRepo: jest.Mocked<TierListRepository>;
  let inviteRepo: jest.Mocked<TierListInviteRepository>;
  let service: TierListSharingService;
  let current: TierList;

  beforeEach(() => {
    current = list();
    tierListRepo = {
      findById: jest.fn().mockImplementation(async () => current),
      addMember: jest.fn().mockResolvedValue(true),
      removeMember: jest.fn().mockResolvedValue(undefined),
      setMemberRole: jest.fn().mockResolvedValue(undefined),
      transferOwnership: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<TierListRepository>;
    inviteRepo = {
      countOpen: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(async (input) => ({
        _id: new Types.ObjectId(),
        ...input,
        acceptedBy: [],
      })),
      findOpen: jest.fn().mockResolvedValue([]),
      findOpenByHash: jest.fn(),
      claim: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<TierListInviteRepository>;
    service = new TierListSharingService(
      new TierListAccessService(tierListRepo, {} as never),
      tierListRepo,
      inviteRepo,
    );
  });

  it("lets only the owner make invite links, and stores only the token's hash", async () => {
    const invite = await service.createInvite("list", "auth0|owner", { role: "editor" });

    expect(inviteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: hashToken(invite.token),
        role: "editor",
        maxUses: 1,
      }),
    );
    await expect(
      service.createInvite("list", "auth0|editor", { role: "viewer" }),
    ).rejects.toMatchObject({ code: "LR-TIER-004" });
  });

  it("caps open invites", async () => {
    inviteRepo.countOpen.mockResolvedValue(10);

    await expect(
      service.createInvite("list", "auth0|owner", { role: "viewer" }),
    ).rejects.toMatchObject({ code: "LR-TIER-007" });
  });

  it("adds the invitee with the name they chose", async () => {
    inviteRepo.findOpenByHash.mockResolvedValue({ tierList: new Types.ObjectId(current.id) } as never);
    inviteRepo.claim.mockResolvedValue({ _id: new Types.ObjectId(), role: "viewer" } as never);

    await service.acceptInvite("token", "auth0|friend", "  Ash  ");

    expect(tierListRepo.addMember).toHaveBeenCalledWith(current.id, {
      sub: "auth0|friend",
      name: "Ash",
      role: "viewer",
    });
  });

  it("does not spend an invite on someone already on the list", async () => {
    inviteRepo.findOpenByHash.mockResolvedValue({ tierList: new Types.ObjectId(current.id) } as never);

    const result = await service.acceptInvite("token", "auth0|editor", "Misty");

    expect(result).toEqual({ slug: "list" });
    expect(inviteRepo.claim).not.toHaveBeenCalled();
  });

  it("never sends member subs to the client", async () => {
    const result = await service.members("list", "auth0|owner");

    expect(JSON.stringify(result)).not.toContain("auth0|editor");
    expect(result.members[0]).toEqual({
      id: memberId("auth0|editor"),
      name: "Misty",
      role: "editor",
      you: false,
    });
  });

  it("lets a member leave but not remove someone else", async () => {
    current = list({
      members: [
        { sub: "auth0|editor", role: "editor" },
        { sub: "auth0|viewer", role: "viewer" },
      ],
    });

    await service.removeMember("list", "auth0|viewer", memberId("auth0|viewer"));
    expect(tierListRepo.removeMember).toHaveBeenCalledWith(current.id, "auth0|viewer");

    await expect(
      service.removeMember("list", "auth0|viewer", memberId("auth0|editor")),
    ).rejects.toMatchObject({ code: "LR-TIER-004" });
  });

  it("hands a list only to an editor", async () => {
    current = list({ members: [{ sub: "auth0|viewer", role: "viewer" }] });

    await expect(
      service.transfer("list", "auth0|owner", memberId("auth0|viewer")),
    ).rejects.toMatchObject({ code: "VAL-002" });
  });

  it("keeps sharing off a tournament's copy", async () => {
    current = list({ tournamentId: new Types.ObjectId().toString() });
    const access = new TierListAccessService(tierListRepo, {
      findById: jest.fn().mockResolvedValue({
        owner: "auth0|owner",
        staff: [],
        completed: false,
      }),
    } as never);
    service = new TierListSharingService(access, tierListRepo, inviteRepo);

    await expect(service.members("list", "auth0|owner")).rejects.toMatchObject({
      code: "LR-TIER-008",
    });
  });
});
