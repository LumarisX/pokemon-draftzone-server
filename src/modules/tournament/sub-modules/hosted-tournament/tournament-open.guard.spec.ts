import { ErrorCodes } from "@core/pdz-error-codes";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  AllowWhileArchived,
  TournamentOpenGuard,
  unarchivesTournament,
} from "./tournament-open.guard";

class Routes {
  write() {}

  @AllowWhileArchived()
  preview() {}

  @AllowWhileArchived(unarchivesTournament)
  settings() {}
}

function contextFor(
  handler: keyof Routes,
  request: { method: string; params?: Record<string, string>; body?: unknown },
): ExecutionContext {
  return {
    getType: () => "http",
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const params = { leagueSlug: "league", tournamentSlug: "cup" };

describe("TournamentOpenGuard", () => {
  let isArchived: jest.Mock;
  let guard: TournamentOpenGuard;

  beforeEach(() => {
    isArchived = jest.fn().mockResolvedValue(true);
    guard = new TournamentOpenGuard(new Reflector(), {
      isArchived,
    } as unknown as HostedTournamentRepository);
  });

  it("refuses a write to an archived tournament", async () => {
    await expect(
      guard.canActivate(contextFor("write", { method: "POST", params })),
    ).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT.ARCHIVED.code });
    expect(isArchived).toHaveBeenCalledWith("league", "cup");
  });

  it("lets a write through when the tournament is open", async () => {
    isArchived.mockResolvedValue(false);

    await expect(
      guard.canActivate(contextFor("write", { method: "PATCH", params })),
    ).resolves.toBe(true);
  });

  it("never checks reads", async () => {
    await expect(
      guard.canActivate(contextFor("write", { method: "GET", params })),
    ).resolves.toBe(true);
    expect(isArchived).not.toHaveBeenCalled();
  });

  it("ignores routes outside a tournament", async () => {
    await expect(
      guard.canActivate(
        contextFor("write", { method: "POST", params: { draftId: "x" } }),
      ),
    ).resolves.toBe(true);
    expect(isArchived).not.toHaveBeenCalled();
  });

  it("lets an exempt route through", async () => {
    await expect(
      guard.canActivate(contextFor("preview", { method: "POST", params })),
    ).resolves.toBe(true);
  });

  it("lets a settings save through only when it unarchives", async () => {
    await expect(
      guard.canActivate(
        contextFor("settings", {
          method: "PATCH",
          params,
          body: { archived: false },
        }),
      ),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(
        contextFor("settings", {
          method: "PATCH",
          params,
          body: { name: "Renamed" },
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT.ARCHIVED.code });
  });
});
