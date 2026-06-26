import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { IS_OPTIONAL_AUTH } from "./optional-auth.decorator";

function buildReflector(isOptional: boolean | undefined) {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isOptional),
  } as unknown as jest.Mocked<Reflector>;
}

function buildContext() {
  const handler = jest.fn();
  class FakeController {}
  return {
    getHandler: jest.fn().mockReturnValue(handler),
    getClass: jest.fn().mockReturnValue(FakeController),
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard.handleRequest", () => {
  it("checks the IS_OPTIONAL_AUTH metadata on both the handler and the class", () => {
    const reflector = buildReflector(false);
    const guard = new JwtAuthGuard(reflector);
    const context = buildContext();

    guard.handleRequest(null, { sub: "auth0|1" }, null, context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_OPTIONAL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  describe("when auth is required (not optional)", () => {
    it("returns the user on success", () => {
      const guard = new JwtAuthGuard(buildReflector(false));
      const user = { sub: "auth0|1" };

      expect(guard.handleRequest(null, user, null, buildContext())).toBe(user);
    });

    it("throws the passport error when one is provided", () => {
      const guard = new JwtAuthGuard(buildReflector(false));
      const error = new Error("strategy blew up");

      expect(() => guard.handleRequest(error, null, null, buildContext())).toThrow(error);
    });

    it("throws UnauthorizedException when there is no user and no error", () => {
      const guard = new JwtAuthGuard(buildReflector(false));

      expect(() => guard.handleRequest(null, null, null, buildContext())).toThrow(
        UnauthorizedException,
      );
    });

    it("logs a warning when passport reports failure info", () => {
      const guard = new JwtAuthGuard(buildReflector(false));
      const logSpy = jest.spyOn((guard as any).logger, "warn").mockImplementation();

      expect(() =>
        guard.handleRequest(null, null, { message: "No auth token" }, buildContext()),
      ).toThrow(UnauthorizedException);
      expect(logSpy).toHaveBeenCalledWith("JWT auth failed: No auth token");
    });
  });

  describe("when auth is optional", () => {
    it("returns the user when authentication succeeded", () => {
      const guard = new JwtAuthGuard(buildReflector(true));
      const user = { sub: "auth0|1" };

      expect(guard.handleRequest(null, user, null, buildContext())).toBe(user);
    });

    it("returns null instead of throwing when there is no user", () => {
      const guard = new JwtAuthGuard(buildReflector(true));

      expect(guard.handleRequest(null, null, null, buildContext())).toBeNull();
    });

    it("returns null instead of throwing when passport reports an error", () => {
      const guard = new JwtAuthGuard(buildReflector(true));

      expect(
        guard.handleRequest(new Error("expired token"), null, null, buildContext()),
      ).toBeNull();
    });

    it("does not log the failure info, since the missing auth is expected", () => {
      const guard = new JwtAuthGuard(buildReflector(true));
      const logSpy = jest.spyOn((guard as any).logger, "warn").mockImplementation();

      guard.handleRequest(null, null, { message: "No auth token" }, buildContext());

      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
