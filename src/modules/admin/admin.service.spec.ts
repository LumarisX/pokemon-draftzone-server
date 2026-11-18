import { UserService } from "@modules/user/user.service";
import { AdminAuditRepository } from "./admin-audit.repository";
import { AdminRepository } from "./admin.repository";
import { AdminService } from "./admin.service";

describe("AdminService.resetDisplayName", () => {
  let userService: jest.Mocked<UserService>;
  let audit: jest.Mocked<AdminAuditRepository>;
  let service: AdminService;

  beforeEach(() => {
    userService = {
      resetDisplayName: jest.fn().mockResolvedValue({
        accountId: "auth0|target",
        profileId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        displayName: "Coach 0042",
      }),
    } as unknown as jest.Mocked<UserService>;
    audit = {
      append: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AdminAuditRepository>;
    service = new AdminService({} as AdminRepository, userService, audit);
  });

  it("resets the name and records who, what and why", async () => {
    const result = await service.resetDisplayName("auth0|admin", {
      profileId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      note: "slur in the name",
    });

    expect(result).toEqual({
      reset: true,
      profileId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      displayName: "Coach 0042",
    });
    expect(userService.resetDisplayName).toHaveBeenCalledWith(
      "bbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(audit.append).toHaveBeenCalledWith({
      actor: "auth0|admin",
      action: "user.reset-display-name",
      target: "auth0|target",
      details: {
        profileId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        displayName: "Coach 0042",
        note: "slur in the name",
      },
    });
  });

  it("writes no audit row when no account has the profile id", async () => {
    userService.resetDisplayName.mockRejectedValue(
      Object.assign(new Error("none"), { code: "USR-010" }),
    );

    await expect(
      service.resetDisplayName("auth0|admin", { profileId: "ghost", note: "n" }),
    ).rejects.toMatchObject({ code: "USR-010" });
    expect(audit.append).not.toHaveBeenCalled();
  });
});
