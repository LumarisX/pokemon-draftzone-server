import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { ROLES_KEY } from "@modules/auth/roles.decorator";
import { RolesGuard } from "@modules/auth/roles.guard";
import { UserRole } from "@modules/user/user.schema";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AdminController } from "./admin.controller";
import { AccountNoteDto, TransferAccountDto } from "./admin.dto";

const ROUTES: [keyof AdminController, RequestMethod, string][] = [
  ["lockAccount", RequestMethod.POST, "accounts/lock"],
  ["unlockAccount", RequestMethod.POST, "accounts/unlock"],
  ["transferAccount", RequestMethod.POST, "accounts/transfer"],
  ["undoAccountTransfer", RequestMethod.POST, "accounts/transfer/undo"],
  ["describeAccount", RequestMethod.GET, "accounts/:profileId"],
  ["resetDisplayName", RequestMethod.POST, "users/reset-display-name"],
];

describe("AdminController account routes", () => {
  it.each(ROUTES)("%s is %s %s", (handler, method, path) => {
    const target = AdminController.prototype[handler] as unknown as object;

    expect(Reflect.getMetadata(METHOD_METADATA, target)).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, target)).toBe(path);
  });

  it.each(ROUTES)("%s is behind the JWT and role guards for owner and admin", (handler) => {
    const target = AdminController.prototype[handler] as unknown as object;
    const roles =
      Reflect.getMetadata(ROLES_KEY, target) ??
      Reflect.getMetadata(ROLES_KEY, AdminController);
    const guards = Reflect.getMetadata("__guards__", AdminController);

    expect(roles).toEqual([UserRole.ADMIN, UserRole.OWNER]);
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it("hands the actor and body to the account service", async () => {
    const accounts = {
      lock: jest.fn().mockResolvedValue({ locked: true, signIns: 1 }),
      unlock: jest.fn().mockResolvedValue({ unlocked: true }),
      transfer: jest.fn().mockResolvedValue({ transferred: true }),
      undoTransfer: jest.fn().mockResolvedValue({ undone: true }),
      describe: jest.fn().mockResolvedValue({ profileId: "a" }),
    };
    const controller = new AdminController({} as any, {} as any, accounts as any);
    const note = { profileId: "a", note: "n" };
    const transfer = {
      newAccountProfileId: "b",
      existingAccountProfileId: "a",
      note: "n",
    };

    await controller.lockAccount("actor", note);
    await controller.unlockAccount("actor", note);
    await controller.transferAccount("actor", transfer);
    await controller.undoAccountTransfer("actor", note);
    await controller.describeAccount("a");

    expect(accounts.lock).toHaveBeenCalledWith("actor", note);
    expect(accounts.unlock).toHaveBeenCalledWith("actor", note);
    expect(accounts.transfer).toHaveBeenCalledWith("actor", transfer);
    expect(accounts.undoTransfer).toHaveBeenCalledWith("actor", note);
    expect(accounts.describe).toHaveBeenCalledWith("a");
  });
});

describe("account admin DTOs", () => {
  it("requires a profile id and a note of 1 to 300 characters", async () => {
    const good = plainToInstance(AccountNoteDto, { profileId: " a ", note: " why " });
    expect(await validate(good)).toHaveLength(0);
    expect(good.profileId).toBe("a");

    for (const body of [
      { profileId: "a" },
      { profileId: "a", note: "" },
      { profileId: "a", note: "   " },
      { profileId: "a", note: "x".repeat(301) },
      { note: "n" },
    ]) {
      expect((await validate(plainToInstance(AccountNoteDto, body))).length).toBeGreaterThan(0);
    }
  });

  it("requires both profile ids and a note for a transfer", async () => {
    const good = plainToInstance(TransferAccountDto, {
      newAccountProfileId: "b",
      existingAccountProfileId: "a",
      note: "n",
    });
    expect(await validate(good)).toHaveLength(0);

    for (const body of [
      { existingAccountProfileId: "a", note: "n" },
      { newAccountProfileId: "b", note: "n" },
      { newAccountProfileId: "b", existingAccountProfileId: "a" },
    ]) {
      expect(
        (await validate(plainToInstance(TransferAccountDto, body))).length,
      ).toBeGreaterThan(0);
    }
  });
});
