import { AccountFootprintService } from "@modules/user/account-footprint.service";
import { AccountIdentityService } from "@modules/user/account-identity.service";
import {
  SignInRow,
  UserSignInRepository,
} from "@modules/user/user-sign-in.repository";
import { AccountRecord, UserRepository } from "@modules/user/user.repository";
import { UserRole } from "@modules/user/user.schema";
import { UserService } from "@modules/user/user.service";
import { AdminAccountService } from "./admin-account.service";
import { AdminAuditRepository } from "./admin-audit.repository";

const ADMIN = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OLD_ID = "111111111111111111111111";
const NEW_ID = "222222222222222222222222";
const OLD_SIGN_IN = "oauth2|discord|stolen";
const NEW_SIGN_IN = "google-oauth2|fresh";

function account(overrides: Partial<AccountRecord>): AccountRecord {
  return {
    accountId: OLD_ID,
    profileId: "old_coach",
    signIn: OLD_SIGN_IN,
    displayName: "Old Coach",
    profile: { discordName: "oldcoach" },
    settings: { theme: "dark" },
    privateProfile: false,
    roles: [],
    joined: new Date("2025-01-01"),
    lastLogin: new Date("2026-11-01"),
    ...overrides,
  };
}

function setup(
  options: {
    internal?: boolean;
    rows?: SignInRow[];
    footprint?: Record<string, number>;
    actorRoles?: UserRole[];
    oldRoles?: UserRole[];
  } = {},
) {
  const rows = new Map<string, SignInRow>(
    (options.rows ?? []).map((row) => [row.signIn, row]),
  );
  const accounts: Record<string, AccountRecord> = {
    old_coach: account({ roles: options.oldRoles ?? [] }),
    new_coach: account({
      accountId: NEW_ID,
      profileId: "new_coach",
      signIn: NEW_SIGN_IN,
      displayName: "New Coach",
      profile: null,
      settings: {},
    }),
  };
  const nonEmpty = new Set(
    Object.entries(options.footprint ?? {})
      .filter(([, count]) => count > 0)
      .map(([id]) => id),
  );

  const log: string[] = [];
  const signIns = {
    find: jest.fn(async (signIn: string) => rows.get(signIn) ?? null),
    listByAccount: jest.fn(async (accountId: string) =>
      [...rows.values()].filter((row) => row.accountId === accountId),
    ),
    block: jest.fn(async (signIn: string, accountId: string) => {
      log.push(`block:${signIn}`);
      rows.set(signIn, { signIn, accountId, blocked: true });
    }),
    unblock: jest.fn(async (signIn: string, accountId: string) => {
      log.push(`unblock:${signIn}`);
      rows.set(signIn, { signIn, accountId, blocked: false });
    }),
    point: jest.fn(async (signIn: string, accountId: string) => {
      if (rows.has(signIn)) return false;
      log.push(`point:${signIn}`);
      rows.set(signIn, { signIn, accountId, blocked: false });
      return true;
    }),
    remove: jest.fn(async (signIn: string, accountId: string) => {
      const row = rows.get(signIn);
      if (!row || row.accountId !== accountId) return false;
      log.push(`remove:${signIn}`);
      rows.delete(signIn);
      return true;
    }),
  };
  const users = {
    findAccountByProfileId: jest.fn(
      async (profileId: string) => accounts[profileId] ?? null,
    ),
    removeAccount: jest.fn(async () => {
      log.push("remove-user");
      return true;
    }),
  };
  const userService = {
    invalidateSignIn: jest.fn(async (signIn: string) => {
      log.push(`invalidate:${signIn}`);
    }),
    getMe: jest.fn(async () => ({ roles: options.actorRoles ?? [UserRole.ADMIN] })),
  };
  const footprints = {
    footprint: jest.fn(async (id: string) => [
      { collection: "drafts", count: nonEmpty.has(id) ? 2 : 0 },
      { collection: "leagues", count: 0 },
    ]),
    isEmpty: jest.fn(async (id: string) => !nonEmpty.has(id)),
  };
  const audit = {
    append: jest.fn(async () => "audit-1"),
    patchDetails: jest.fn(async () => undefined),
    findOpenTransfers: jest.fn(async (): Promise<any[]> => []),
  };
  const identity = {
    internal: options.internal ?? true,
  } as unknown as AccountIdentityService;

  const service = new AdminAccountService(
    identity,
    users as unknown as UserRepository,
    signIns as unknown as UserSignInRepository,
    userService as unknown as UserService,
    footprints as unknown as AccountFootprintService,
    audit as unknown as AdminAuditRepository,
  );
  return { service, rows, signIns, users, userService, footprints, audit, log };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return [OLD_ID, NEW_ID, OLD_SIGN_IN, NEW_SIGN_IN, ADMIN].some((secret) =>
    text.includes(secret),
  );
}

describe("AdminAccountService in auth0 mode", () => {
  it.each([
    ["describe", (s: AdminAccountService) => s.describe("old_coach")],
    ["lock", (s: AdminAccountService) => s.lock(ADMIN, { profileId: "old_coach", note: "n" })],
    ["unlock", (s: AdminAccountService) => s.unlock(ADMIN, { profileId: "old_coach", note: "n" })],
    [
      "transfer",
      (s: AdminAccountService) =>
        s.transfer(ADMIN, {
          newAccountProfileId: "new_coach",
          existingAccountProfileId: "old_coach",
          note: "n",
        }),
    ],
    ["undo", (s: AdminAccountService) => s.undoTransfer(ADMIN, { profileId: "old_coach", note: "n" })],
  ])("refuses %s with a 409 and touches nothing", async (_name, run) => {
    const ctx = setup({ internal: false });

    await expect(run(ctx.service)).rejects.toMatchObject({
      status: 409,
      code: "USR-012",
    });
    expect(ctx.users.findAccountByProfileId).not.toHaveBeenCalled();
    expect(ctx.signIns.find).not.toHaveBeenCalled();
    expect(ctx.signIns.listByAccount).not.toHaveBeenCalled();
    expect(ctx.signIns.block).not.toHaveBeenCalled();
    expect(ctx.signIns.point).not.toHaveBeenCalled();
    expect(ctx.audit.append).not.toHaveBeenCalled();
    expect(ctx.userService.invalidateSignIn).not.toHaveBeenCalled();
  });
});

describe("AdminAccountService.describe", () => {
  it("describes an account by profile id without account ids", async () => {
    const ctx = setup({ footprint: { [OLD_ID]: 1 } });

    const result = await ctx.service.describe("old_coach");

    expect(result).toEqual({
      profileId: "old_coach",
      displayName: "Old Coach",
      joined: new Date("2025-01-01"),
      lastLogin: new Date("2026-11-01"),
      locked: false,
      signInCount: 1,
      blockedSignInCount: 0,
      empty: false,
      footprint: [{ collection: "drafts", count: 2 }],
    });
    expect(leaks(result)).toBe(false);
  });

  it("reports an empty account and an empty footprint", async () => {
    const ctx = setup();

    const result = await ctx.service.describe("new_coach");

    expect(result.empty).toBe(true);
    expect(result.footprint).toEqual([]);
  });

  it("counts re-pointed sign-ins and reports locked only when all are blocked", async () => {
    const ctx = setup({
      rows: [
        { signIn: OLD_SIGN_IN, accountId: OLD_ID, blocked: true },
        { signIn: NEW_SIGN_IN, accountId: OLD_ID, blocked: false },
      ],
    });

    const open = await ctx.service.describe("old_coach");
    expect(open).toMatchObject({ signInCount: 2, blockedSignInCount: 1, locked: false });

    ctx.rows.set(NEW_SIGN_IN, { signIn: NEW_SIGN_IN, accountId: OLD_ID, blocked: true });
    expect(await ctx.service.describe("old_coach")).toMatchObject({ locked: true });
  });

  it("answers 404 for an unknown or malformed profile id", async () => {
    const ctx = setup();

    await expect(ctx.service.describe("nobody")).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.describe("!!")).rejects.toMatchObject({ status: 404 });
  });
});

describe("AdminAccountService.lock", () => {
  it("blocks the account's own sign-in and invalidates its caches", async () => {
    const ctx = setup();

    const result = await ctx.service.lock(ADMIN, { profileId: "old_coach", note: "stolen" });

    expect(result).toEqual({ locked: true, signIns: 1 });
    expect(ctx.signIns.block).toHaveBeenCalledWith(OLD_SIGN_IN, OLD_ID, expect.any(Date));
    expect(ctx.userService.invalidateSignIn).toHaveBeenCalledWith(OLD_SIGN_IN, OLD_ID);
    expect(ctx.log).toEqual([`block:${OLD_SIGN_IN}`, `invalidate:${OLD_SIGN_IN}`]);
    expect(leaks(result)).toBe(false);
  });

  it("blocks re-pointed sign-ins as well and leaves other accounts' rows alone", async () => {
    const ctx = setup({
      rows: [
        { signIn: NEW_SIGN_IN, accountId: OLD_ID, blocked: false },
        { signIn: "other", accountId: "333333333333333333333333", blocked: false },
      ],
    });

    const result = await ctx.service.lock(ADMIN, { profileId: "old_coach", note: "stolen" });

    expect(result.signIns).toBe(2);
    expect(ctx.rows.get(NEW_SIGN_IN)?.blocked).toBe(true);
    expect(ctx.rows.get(OLD_SIGN_IN)?.blocked).toBe(true);
    expect(ctx.rows.get("other")?.blocked).toBe(false);
  });

  it("is idempotent", async () => {
    const ctx = setup();

    await ctx.service.lock(ADMIN, { profileId: "old_coach", note: "stolen" });
    const again = await ctx.service.lock(ADMIN, { profileId: "old_coach", note: "stolen" });

    expect(again).toEqual({ locked: true, signIns: 1 });
    expect(ctx.rows.size).toBe(1);
    expect(ctx.rows.get(OLD_SIGN_IN)?.blocked).toBe(true);
  });

  it("does not touch an own sign-in that has been re-pointed at another account", async () => {
    const ctx = setup({
      rows: [{ signIn: OLD_SIGN_IN, accountId: NEW_ID, blocked: false }],
    });

    const result = await ctx.service.lock(ADMIN, { profileId: "old_coach", note: "n" });

    expect(result.signIns).toBe(0);
    expect(ctx.signIns.block).not.toHaveBeenCalled();
  });

  it("records the actor, action, target and note in the audit trail", async () => {
    const ctx = setup();

    await ctx.service.lock(ADMIN, { profileId: "old_coach", note: "stolen" });

    expect(ctx.audit.append).toHaveBeenCalledWith({
      actor: ADMIN,
      action: "account.lock",
      target: OLD_ID,
      details: {
        profileId: "old_coach",
        displayName: "Old Coach",
        note: "stolen",
        signIns: [OLD_SIGN_IN],
      },
    });
  });

  it("keeps earlier sign-ins blocked and invalidated when a later write fails", async () => {
    const ctx = setup({
      rows: [{ signIn: NEW_SIGN_IN, accountId: OLD_ID, blocked: false }],
    });
    ctx.signIns.block.mockImplementationOnce(async (signIn: string, accountId: string) => {
      ctx.rows.set(signIn, { signIn, accountId, blocked: true });
    });
    ctx.signIns.block.mockRejectedValueOnce(new Error("write failed"));

    await expect(
      ctx.service.lock(ADMIN, { profileId: "old_coach", note: "n" }),
    ).rejects.toThrow("write failed");

    expect(ctx.userService.invalidateSignIn).toHaveBeenCalledTimes(1);
    expect(ctx.audit.append).not.toHaveBeenCalled();
  });

  it("refuses to lock yourself", async () => {
    const ctx = setup();
    ctx.users.findAccountByProfileId.mockResolvedValueOnce(account({ accountId: ADMIN }));

    await expect(
      ctx.service.lock(ADMIN, { profileId: "old_coach", note: "n" }),
    ).rejects.toMatchObject({ code: "USR-020" });
    expect(ctx.signIns.block).not.toHaveBeenCalled();
  });

  it("lets only an owner lock an admin account", async () => {
    const asAdmin = setup({ oldRoles: [UserRole.ADMIN], actorRoles: [UserRole.ADMIN] });

    await expect(
      asAdmin.service.lock(ADMIN, { profileId: "old_coach", note: "n" }),
    ).rejects.toMatchObject({ code: "USR-019", status: 403 });
    expect(asAdmin.signIns.block).not.toHaveBeenCalled();

    const asOwner = setup({ oldRoles: [UserRole.ADMIN], actorRoles: [UserRole.OWNER] });
    await expect(
      asOwner.service.lock(ADMIN, { profileId: "old_coach", note: "n" }),
    ).resolves.toEqual({ locked: true, signIns: 1 });
  });
});

describe("AdminAccountService.unlock", () => {
  it("removes the hold row and unblocks re-pointed rows", async () => {
    const ctx = setup({
      rows: [
        { signIn: OLD_SIGN_IN, accountId: OLD_ID, blocked: true },
        { signIn: NEW_SIGN_IN, accountId: OLD_ID, blocked: true },
      ],
    });

    const result = await ctx.service.unlock(ADMIN, { profileId: "old_coach", note: "false alarm" });

    expect(result).toEqual({ unlocked: true });
    expect(ctx.rows.has(OLD_SIGN_IN)).toBe(false);
    expect(ctx.rows.get(NEW_SIGN_IN)).toEqual({
      signIn: NEW_SIGN_IN,
      accountId: OLD_ID,
      blocked: false,
    });
    expect(ctx.userService.invalidateSignIn).toHaveBeenCalledWith(OLD_SIGN_IN, OLD_ID);
    expect(ctx.userService.invalidateSignIn).toHaveBeenCalledWith(NEW_SIGN_IN, OLD_ID);
    expect(leaks(result)).toBe(false);
  });

  it("is idempotent and writes the audit row before changing anything", async () => {
    const ctx = setup();

    await ctx.service.unlock(ADMIN, { profileId: "old_coach", note: "n" });
    await ctx.service.unlock(ADMIN, { profileId: "old_coach", note: "n" });

    expect(ctx.audit.append).toHaveBeenCalledTimes(2);
    expect(ctx.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.unlock", target: OLD_ID }),
    );
  });

  it("changes nothing when the audit write fails", async () => {
    const ctx = setup({
      rows: [{ signIn: OLD_SIGN_IN, accountId: OLD_ID, blocked: true }],
    });
    ctx.audit.append.mockRejectedValueOnce(new Error("audit down"));

    await expect(
      ctx.service.unlock(ADMIN, { profileId: "old_coach", note: "n" }),
    ).rejects.toThrow("audit down");

    expect(ctx.rows.get(OLD_SIGN_IN)?.blocked).toBe(true);
  });
});

describe("AdminAccountService.transfer", () => {
  const dto = {
    newAccountProfileId: "new_coach",
    existingAccountProfileId: "old_coach",
    note: "lost the discord",
  };

  function expectNothingWritten(ctx: ReturnType<typeof setup>) {
    expect(ctx.audit.append).not.toHaveBeenCalled();
    expect(ctx.signIns.point).not.toHaveBeenCalled();
    expect(ctx.users.removeAccount).not.toHaveBeenCalled();
    expect(ctx.userService.invalidateSignIn).not.toHaveBeenCalled();
  }

  it("points the new sign-in at the old account, removes the new user and audits", async () => {
    const ctx = setup();

    const result = await ctx.service.transfer(ADMIN, dto);

    expect(result).toEqual({ transferred: true });
    expect(ctx.rows.get(NEW_SIGN_IN)).toEqual({
      signIn: NEW_SIGN_IN,
      accountId: OLD_ID,
      blocked: false,
    });
    expect(ctx.users.removeAccount).toHaveBeenCalledWith(NEW_ID, NEW_SIGN_IN);
    expect(ctx.userService.invalidateSignIn).toHaveBeenCalledWith(
      NEW_SIGN_IN,
      NEW_ID,
      OLD_ID,
    );
    expect(ctx.audit.append).toHaveBeenCalledWith({
      actor: ADMIN,
      action: "account.transfer",
      target: OLD_ID,
      details: expect.objectContaining({
        note: "lost the discord",
        signIn: NEW_SIGN_IN,
        newAccountId: NEW_ID,
        signInRowBefore: null,
        signInRowAfter: { accountId: OLD_ID, blocked: false },
        removedUser: {
          profileId: "new_coach",
          displayName: "New Coach",
          settings: {},
          profile: null,
          privateProfile: false,
          joined: new Date("2025-01-01"),
        },
      }),
    });
    expect(ctx.audit.patchDetails).toHaveBeenCalledWith("audit-1", { state: "applied" });
    expect(leaks(result)).toBe(false);
  });

  it("repoints before it deletes anything and never blocks the new account", async () => {
    const ctx = setup();

    await ctx.service.transfer(ADMIN, dto);

    const order = ctx.log;
    expect(order.indexOf(`point:${NEW_SIGN_IN}`)).toBeLessThan(
      order.indexOf("remove-user"),
    );
    expect(order.some((entry) => entry.startsWith("block"))).toBe(false);
  });

  it("does not touch or lock the old account's own sign-in", async () => {
    const ctx = setup();

    await ctx.service.transfer(ADMIN, dto);

    expect(ctx.rows.has(OLD_SIGN_IN)).toBe(false);
    expect(ctx.signIns.block).not.toHaveBeenCalled();
  });

  it("refuses two identical accounts", async () => {
    const ctx = setup();

    await expect(
      ctx.service.transfer(ADMIN, { ...dto, newAccountProfileId: "old_coach" }),
    ).rejects.toMatchObject({ code: "USR-013", status: 400 });
    expectNothingWritten(ctx);
  });

  it("refuses a missing account", async () => {
    const ctx = setup();

    await expect(
      ctx.service.transfer(ADMIN, { ...dto, existingAccountProfileId: "nobody" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ctx.service.transfer(ADMIN, { ...dto, newAccountProfileId: "nobody" }),
    ).rejects.toMatchObject({ status: 404 });
    expectNothingWritten(ctx);
  });

  it("refuses a new account that has data", async () => {
    const ctx = setup({ footprint: { [NEW_ID]: 1 } });

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toMatchObject({
      code: "USR-017",
      status: 409,
    });
    expectNothingWritten(ctx);
  });

  it("refuses a new account that other sign-ins point at", async () => {
    const ctx = setup({
      rows: [{ signIn: "extra", accountId: NEW_ID, blocked: false }],
    });

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toMatchObject({
      code: "USR-015",
    });
    expectNothingWritten(ctx);
  });

  it("refuses a new account whose sign-in is locked", async () => {
    const ctx = setup({
      rows: [{ signIn: NEW_SIGN_IN, accountId: NEW_ID, blocked: true }],
    });

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toMatchObject({
      code: "USR-014",
    });
    expectNothingWritten(ctx);
  });

  it("refuses a new account whose sign-in already reaches another account", async () => {
    const ctx = setup({
      rows: [{ signIn: NEW_SIGN_IN, accountId: "333333333333333333333333", blocked: false }],
    });

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toMatchObject({
      code: "USR-016",
    });
    expectNothingWritten(ctx);
  });

  it("refuses to transfer into or out of your own account", async () => {
    const ctx = setup();
    ctx.users.findAccountByProfileId.mockResolvedValueOnce(account({ accountId: ADMIN, signIn: "x" }));

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toMatchObject({
      code: "USR-020",
    });
    expectNothingWritten(ctx);
  });

  it("lets only an owner transfer into an admin account", async () => {
    const ctx = setup({ oldRoles: [UserRole.ADMIN], actorRoles: [UserRole.ADMIN] });

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toMatchObject({
      code: "USR-019",
    });
    expectNothingWritten(ctx);
  });

  it("rolls the sign-in back when data appears on the new account mid-transfer", async () => {
    const ctx = setup();
    ctx.footprints.isEmpty.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toMatchObject({
      code: "USR-017",
    });

    expect(ctx.rows.has(NEW_SIGN_IN)).toBe(false);
    expect(ctx.users.removeAccount).not.toHaveBeenCalled();
    expect(ctx.audit.patchDetails).toHaveBeenCalledWith("audit-1", { state: "failed" });
  });

  it("rolls back when invalidation fails after the write", async () => {
    const ctx = setup();
    ctx.userService.invalidateSignIn.mockRejectedValueOnce(new Error("cache down"));

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toThrow("cache down");

    expect(ctx.rows.has(NEW_SIGN_IN)).toBe(false);
    expect(ctx.users.removeAccount).not.toHaveBeenCalled();
  });

  it("writes nothing when the audit row cannot be written", async () => {
    const ctx = setup();
    ctx.audit.append.mockRejectedValueOnce(new Error("audit down"));

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toThrow("audit down");

    expect(ctx.signIns.point).not.toHaveBeenCalled();
    expect(ctx.users.removeAccount).not.toHaveBeenCalled();
  });

  it("keeps the transfer in force when removing the empty user fails afterwards", async () => {
    const ctx = setup();
    ctx.users.removeAccount.mockRejectedValueOnce(new Error("delete failed"));

    await expect(ctx.service.transfer(ADMIN, dto)).rejects.toThrow("delete failed");

    expect(ctx.rows.get(NEW_SIGN_IN)?.accountId).toBe(OLD_ID);
    expect(ctx.audit.patchDetails).toHaveBeenCalledWith("audit-1", { state: "applied" });
  });
});

describe("AdminAccountService.undoTransfer", () => {
  const stored = {
    id: "audit-7",
    target: OLD_ID,
    details: { signIn: NEW_SIGN_IN, newAccountId: NEW_ID },
  };

  it("removes the re-pointing row so the sign-in goes back to its own account", async () => {
    const ctx = setup({
      rows: [{ signIn: NEW_SIGN_IN, accountId: OLD_ID, blocked: false }],
    });
    ctx.audit.findOpenTransfers.mockResolvedValue([stored]);

    const result = await ctx.service.undoTransfer(ADMIN, { profileId: "old_coach", note: "wrong person" });

    expect(result).toEqual({ undone: true });
    expect(ctx.rows.has(NEW_SIGN_IN)).toBe(false);
    expect(ctx.userService.invalidateSignIn).toHaveBeenCalledWith(
      NEW_SIGN_IN,
      OLD_ID,
      NEW_ID,
    );
    expect(ctx.audit.patchDetails).toHaveBeenCalledWith("audit-7", {
      undoneAt: expect.any(Date),
      undoneBy: ADMIN,
    });
    expect(ctx.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.transfer-undo", target: OLD_ID }),
    );
    expect(leaks(result)).toBe(false);
  });

  it("skips a transfer whose row no longer points at the account", async () => {
    const ctx = setup({
      rows: [{ signIn: "second", accountId: OLD_ID, blocked: false }],
    });
    ctx.audit.findOpenTransfers.mockResolvedValue([
      { ...stored, id: "audit-9", details: { signIn: "gone", newAccountId: NEW_ID } },
      { ...stored, id: "audit-8", details: { signIn: "second", newAccountId: NEW_ID } },
    ]);

    await ctx.service.undoTransfer(ADMIN, { profileId: "old_coach", note: "n" });

    expect(ctx.rows.has("second")).toBe(false);
    expect(ctx.audit.patchDetails).toHaveBeenCalledWith("audit-8", expect.anything());
  });

  it("refuses when there is nothing to undo", async () => {
    const ctx = setup();

    await expect(
      ctx.service.undoTransfer(ADMIN, { profileId: "old_coach", note: "n" }),
    ).rejects.toMatchObject({ code: "USR-018", status: 404 });
    expect(ctx.signIns.remove).not.toHaveBeenCalled();
    expect(ctx.audit.append).not.toHaveBeenCalled();
  });

  it("refuses when the audit row exists but the sign-in row is already gone", async () => {
    const ctx = setup();
    ctx.audit.findOpenTransfers.mockResolvedValue([stored]);

    await expect(
      ctx.service.undoTransfer(ADMIN, { profileId: "old_coach", note: "n" }),
    ).rejects.toMatchObject({ code: "USR-018" });
  });
});
