import { AccountDeletionService } from "./account-deletion.service";
import { AccountMergeService } from "./account-merge.service";
import { UserController } from "./user.controller";
import { User } from "./user.domain";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  DiscordCallbackDto,
  MergeAccountsDto,
  UpdateProfileDto,
  UserSettingsDto,
} from "./user.dto";
import { UserService } from "./user.service";

describe("UserController", () => {
  let service: jest.Mocked<UserService>;
  let controller: UserController;
  let merges: jest.Mocked<AccountMergeService>;
  let deletions: jest.Mocked<AccountDeletionService>;

  beforeEach(() => {
    service = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      syncUser: jest.fn(),
      getMe: jest.fn(),
      getOrCreateMe: jest.fn(),
      getMeConnected: jest.fn(),
      connectDiscord: jest.fn(),
      completeDiscordConnect: jest.fn(),
      disconnectDiscord: jest.fn(),
      updateProfile: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    merges = { merge: jest.fn() } as unknown as jest.Mocked<AccountMergeService>;
    deletions = {
      status: jest.fn(),
      schedule: jest.fn(),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<AccountDeletionService>;
    controller = new UserController(service, merges, deletions);
  });

  it("serves the deletion status, schedule and cancel routes", async () => {
    deletions.status.mockResolvedValue({ scheduledFor: null, blockers: [] });
    deletions.schedule.mockResolvedValue({ scheduledFor: "2026-12-20T00:00:00.000Z" });
    deletions.cancel.mockResolvedValue({ scheduledFor: null });

    expect(await controller.getDeletion("acct-1")).toEqual({
      scheduledFor: null,
      blockers: [],
    });
    expect(await controller.scheduleDeletion("acct-1")).toEqual({
      scheduledFor: "2026-12-20T00:00:00.000Z",
    });
    expect(await controller.cancelDeletion("acct-1")).toEqual({
      scheduledFor: null,
    });
    expect(deletions.schedule).toHaveBeenCalledWith("acct-1");
  });

  it("reports the scheduled deletion date in the me payload", async () => {
    service.getMeConnected.mockResolvedValue(
      new User({
        sub: "acct-1",
        joined: new Date("2026-01-01"),
        lastLogin: new Date("2026-02-01"),
        deletion: {
          requestedAt: new Date("2026-11-20T00:00:00.000Z"),
          scheduledFor: new Date("2026-12-20T00:00:00.000Z"),
        },
      }),
    );

    const result: any = await controller.getMe("acct-1");

    expect(result.deletionScheduledFor).toBe("2026-12-20T00:00:00.000Z");
  });

  it("reports no scheduled deletion as null", async () => {
    service.getMeConnected.mockResolvedValue(buildUser());

    const result: any = await controller.getMe("auth0|user-1");

    expect(result.deletionScheduledFor).toBeNull();
  });

  it("mergeAccounts forwards the offer and answers with the me payload", async () => {
    merges.merge.mockResolvedValue({ user: buildUser() });

    const result: any = await controller.mergeAccounts("acct-1", {
      token: "tok",
      keep: "other",
    });

    expect(merges.merge).toHaveBeenCalledWith("acct-1", "tok", "other");
    expect(result.me.sub).toBe("auth0|user-1");
  });

  it.each([
    [{ token: "t", keep: "current" }, 0],
    [{ token: "t", keep: "other" }, 0],
    [{ token: "t", keep: "both" }, 1],
    [{ keep: "other" }, 1],
    [{ token: "", keep: "other" }, 1],
  ])("validates the merge body %j", async (body, errors) => {
    const dto = plainToInstance(MergeAccountsDto, body);

    expect(await validate(dto)).toHaveLength(errors);
  });

  it("getSettings forwards the authenticated sub", async () => {
    const settings = { theme: "dark" } as any;
    service.getSettings.mockResolvedValue(settings);

    const result = await controller.getSettings("auth0|user-1");

    expect(service.getSettings).toHaveBeenCalledWith("auth0|user-1");
    expect(result).toBe(settings);
  });

  it("updateSettings forwards the sub and body", async () => {
    const body = { theme: "dark" } as UserSettingsDto;
    const updated = { theme: "dark" } as any;
    service.updateSettings.mockResolvedValue(updated);

    const result = await controller.updateSettings("auth0|user-1", body);

    expect(service.updateSettings).toHaveBeenCalledWith("auth0|user-1", body);
    expect(result).toBe(updated);
  });

  function buildUser(): User {
    return new User({
      sub: "auth0|user-1",
      joined: new Date("2026-01-01"),
      lastLogin: new Date("2026-02-01"),
      username: "Provider Name",
      profileId: "0123456789abcdef01234567",
      displayName: "Ash",
    });
  }

  it("getMe gets or creates the user and returns the client payload", async () => {
    service.getMeConnected.mockResolvedValue(buildUser());

    const result: any = await controller.getMe("auth0|user-1");

    expect(service.getMeConnected).toHaveBeenCalledWith("auth0|user-1");
    expect(service.getMe).not.toHaveBeenCalled();
    expect(result.profileId).toBe("0123456789abcdef01234567");
    expect(result.displayName).toBe("Ash");
    expect(result).not.toHaveProperty("username");
    expect(result).not.toHaveProperty("handle");
  });

  it("no longer serves the handle routes", () => {
    expect(
      (UserController.prototype as unknown as Record<string, unknown>)
        .checkHandle,
    ).toBeUndefined();
    expect(
      (UserController.prototype as unknown as Record<string, unknown>)
        .setHandle,
    ).toBeUndefined();
  });

  it("updateProfile returns the client payload", async () => {
    service.updateProfile.mockResolvedValue(buildUser());
    const body: UpdateProfileDto = { gameName: "AshK" };

    const result: any = await controller.updateProfile("auth0|user-1", body);

    expect(service.updateProfile).toHaveBeenCalledWith("auth0|user-1", body);
    expect(result.sub).toBe("auth0|user-1");
  });

  it("updateProfile returns privateProfile in the me payload", async () => {
    service.updateProfile.mockResolvedValue(
      new User({
        sub: "auth0|user-1",
        joined: new Date("2026-01-01"),
        lastLogin: new Date("2026-02-01"),
        privateProfile: true,
      }),
    );

    const result: any = await controller.updateProfile("auth0|user-1", {
      privateProfile: true,
    });

    expect(service.updateProfile).toHaveBeenCalledWith("auth0|user-1", {
      privateProfile: true,
    });
    expect(result.privateProfile).toBe(true);
  });

  it.each([
    [{ privateProfile: true }, 0],
    [{ privateProfile: false }, 0],
    [{}, 0],
    [{ privateProfile: "yes" }, 1],
  ])("validates the profile body %j", async (body, errors) => {
    const dto = plainToInstance(UpdateProfileDto, body);

    expect(await validate(dto)).toHaveLength(errors);
  });

  it("connectDiscord forwards the sub and returnTo and returns the url", async () => {
    service.connectDiscord.mockResolvedValue({ url: "https://discord.com/x" });

    const result = await controller.connectDiscord("auth0|user-1", {
      returnTo: "/leagues/a",
    });

    expect(service.connectDiscord).toHaveBeenCalledWith(
      "auth0|user-1",
      "/leagues/a",
    );
    expect(result).toEqual({ url: "https://discord.com/x" });
  });

  it("discordCallback returns the me payload and where to go next", async () => {
    service.completeDiscordConnect.mockResolvedValue({
      user: buildUser(),
      returnTo: "/settings",
    });

    const result: any = await controller.discordCallback("auth0|user-1", {
      code: "c",
      state: "s",
    });

    expect(service.completeDiscordConnect).toHaveBeenCalledWith(
      "auth0|user-1",
      "c",
      "s",
    );
    expect(result.returnTo).toBe("/settings");
    expect(result.me.sub).toBe("auth0|user-1");
    expect(result.me.discord).toBeNull();
  });

  it("disconnectDiscord returns the me payload", async () => {
    service.disconnectDiscord.mockResolvedValue(buildUser());

    const result: any = await controller.disconnectDiscord("auth0|user-1");

    expect(service.disconnectDiscord).toHaveBeenCalledWith("auth0|user-1");
    expect(result.sub).toBe("auth0|user-1");
  });

  it.each([
    [{ code: "c", state: "s" }, 0],
    [{ code: "c" }, 1],
    [{ state: "s" }, 1],
    [{ code: "", state: "s" }, 1],
  ])("validates the callback body %j", async (body, errors) => {
    const dto = plainToInstance(DiscordCallbackDto, body);

    expect(await validate(dto)).toHaveLength(errors);
  });
});
