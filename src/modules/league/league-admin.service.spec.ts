import { hashInviteToken } from "@modules/tournament/sub-modules/hosted-tournament/tournament-organizer.service";
import { Types } from "mongoose";
import { LeagueAdminInviteRepository } from "./league-admin-invite.repository";
import { LeagueAdminService } from "./league-admin.service";
import { LeagueRepository } from "./league.repository";

const leagueId = new Types.ObjectId();

function buildLeague(overrides: Record<string, unknown> = {}) {
  return {
    _id: leagueId,
    name: "Spring League",
    slug: "springleague",
    owner: "auth0|owner",
    admins: [{ sub: "auth0|admin", name: "Brock" }],
    ...overrides,
  } as any;
}

function buildInvite(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    leagueId,
    name: "Misty",
    createdBy: "auth0|owner",
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as any;
}

describe("LeagueAdminService", () => {
  let leagueRepo: jest.Mocked<LeagueRepository>;
  let inviteRepo: jest.Mocked<LeagueAdminInviteRepository>;
  let service: LeagueAdminService;

  beforeEach(() => {
    leagueRepo = {
      findBySlug: jest.fn().mockResolvedValue(buildLeague()),
      addAdmin: jest.fn().mockResolvedValue(true),
      removeAdmin: jest.fn().mockResolvedValue(undefined),
      setAdminName: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LeagueRepository>;
    inviteRepo = {
      create: jest.fn().mockResolvedValue(buildInvite()),
      countPendingByLeague: jest.fn().mockResolvedValue(0),
      findPendingByLeague: jest.fn().mockResolvedValue([]),
      findByTokenHash: jest.fn().mockResolvedValue(buildInvite()),
      claim: jest.fn().mockResolvedValue(buildInvite()),
      release: jest.fn().mockResolvedValue(undefined),
      deletePending: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<LeagueAdminInviteRepository>;
    service = new LeagueAdminService(leagueRepo, inviteRepo);
  });

  it("shows the admin list to admins but hides pending invites from them", async () => {
    const result = await service.getAdmins("springleague", "auth0|admin");

    expect(result.canEdit).toBe(false);
    expect(result.admins).toEqual([
      { sub: "auth0|admin", name: "Brock", isYou: true },
    ]);
    expect(inviteRepo.findPendingByLeague).not.toHaveBeenCalled();
  });

  it("keeps the admin list from anyone outside the league", async () => {
    await expect(
      service.getAdmins("springleague", "auth0|stranger"),
    ).rejects.toMatchObject({ code: "LR-005" });
  });

  it("only lets the owner create invites, storing just the token hash", async () => {
    await expect(
      service.createInvite("springleague", "auth0|admin", "Misty"),
    ).rejects.toMatchObject({ code: "LR-004" });

    const result = await service.createInvite(
      "springleague",
      "auth0|owner",
      "Misty",
    );

    const stored = inviteRepo.create.mock.calls[0][0];
    expect(stored.tokenHash).toBe(hashInviteToken(result.created.token));
    expect(stored).not.toHaveProperty("token");
  });

  it("caps pending invites", async () => {
    inviteRepo.countPendingByLeague.mockResolvedValue(10);

    await expect(
      service.createInvite("springleague", "auth0|owner", "Misty"),
    ).rejects.toMatchObject({ code: "LR-007" });
  });

  it("adds the person who accepts under the name they chose", async () => {
    const result = await service.acceptInvite(
      "springleague",
      "auth0|misty",
      "token",
      "Misty W",
    );

    expect(result).toEqual({ leagueSlug: "springleague" });
    expect(leagueRepo.addAdmin).toHaveBeenCalledWith(leagueId, {
      sub: "auth0|misty",
      name: "Misty W",
    });
  });

  it("refuses an invite for another league or one that expired", async () => {
    inviteRepo.findByTokenHash.mockResolvedValue(
      buildInvite({ leagueId: new Types.ObjectId() }),
    );
    await expect(
      service.acceptInvite("springleague", "auth0|misty", "token"),
    ).rejects.toMatchObject({ code: "LR-006" });

    inviteRepo.findByTokenHash.mockResolvedValue(
      buildInvite({ expiresAt: new Date(Date.now() - 1) }),
    );
    await expect(
      service.acceptInvite("springleague", "auth0|misty", "token"),
    ).rejects.toMatchObject({ code: "LR-006" });
    expect(leagueRepo.addAdmin).not.toHaveBeenCalled();
  });

  it("refuses the owner or an existing admin", async () => {
    await expect(
      service.acceptInvite("springleague", "auth0|owner", "token"),
    ).rejects.toMatchObject({ code: "LR-008" });
    await expect(
      service.acceptInvite("springleague", "auth0|admin", "token"),
    ).rejects.toMatchObject({ code: "LR-008" });
    expect(inviteRepo.claim).not.toHaveBeenCalled();
  });

  it("releases the invite when the add loses a race", async () => {
    leagueRepo.addAdmin.mockResolvedValue(false);

    await expect(
      service.acceptInvite("springleague", "auth0|misty", "token"),
    ).rejects.toMatchObject({ code: "LR-008" });
    expect(inviteRepo.release).toHaveBeenCalled();
  });

  it("lets the owner remove an admin and an admin leave, but not remove others", async () => {
    await service.removeAdmin("springleague", "auth0|owner", "auth0|admin");
    expect(leagueRepo.removeAdmin).toHaveBeenCalledWith(leagueId, "auth0|admin");

    await expect(
      service.removeAdmin("springleague", "auth0|admin", "auth0|admin"),
    ).resolves.toEqual({ left: true });

    leagueRepo.findBySlug.mockResolvedValue(
      buildLeague({
        admins: [
          { sub: "auth0|admin", name: "Brock" },
          { sub: "auth0|other", name: "Misty" },
        ],
      }),
    );
    await expect(
      service.removeAdmin("springleague", "auth0|admin", "auth0|other"),
    ).rejects.toMatchObject({ code: "LR-004" });
  });

  it("never treats the owner as a removable admin", async () => {
    await expect(
      service.removeAdmin("springleague", "auth0|owner", "auth0|owner"),
    ).rejects.toMatchObject({ code: "LR-009" });
  });
});
