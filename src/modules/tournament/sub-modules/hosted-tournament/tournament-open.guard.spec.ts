import { ErrorCodes } from "@core/pdz-error-codes";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  AllowWhileCompleted,
  reopensTournament,
  TournamentOpenGuard,
} from "./tournament-open.guard";

class Routes {
  write() {}

  @AllowWhileCompleted()
  preview() {}

  @AllowWhileCompleted(reopensTournament)
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
  let isCompleted: jest.Mock;
  let guard: TournamentOpenGuard;

  beforeEach(() => {
    isCompleted = jest.fn().mockResolvedValue(true);
    guard = new TournamentOpenGuard(new Reflector(), {
      isCompleted,
    } as unknown as HostedTournamentRepository);
  });

  it("refuses a write to a completed tournament", async () => {
    await expect(
      guard.canActivate(contextFor("write", { method: "POST", params })),
    ).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT.COMPLETED.code });
    expect(isCompleted).toHaveBeenCalledWith("league", "cup");
  });

  it("lets a write through when the tournament is open", async () => {
    isCompleted.mockResolvedValue(false);

    await expect(
      guard.canActivate(contextFor("write", { method: "PATCH", params })),
    ).resolves.toBe(true);
  });

  it("never checks reads", async () => {
    await expect(
      guard.canActivate(contextFor("write", { method: "GET", params })),
    ).resolves.toBe(true);
    expect(isCompleted).not.toHaveBeenCalled();
  });

  it("ignores routes outside a tournament", async () => {
    await expect(
      guard.canActivate(
        contextFor("write", { method: "POST", params: { draftId: "x" } }),
      ),
    ).resolves.toBe(true);
    expect(isCompleted).not.toHaveBeenCalled();
  });

  it("lets an exempt route through", async () => {
    await expect(
      guard.canActivate(contextFor("preview", { method: "POST", params })),
    ).resolves.toBe(true);
  });

  it("lets a settings save through only when it reopens", async () => {
    await expect(
      guard.canActivate(
        contextFor("settings", {
          method: "PATCH",
          params,
          body: { completed: false },
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
    ).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT.COMPLETED.code });
  });
});
