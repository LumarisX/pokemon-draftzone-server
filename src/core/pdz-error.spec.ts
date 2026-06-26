import { HttpException } from "@nestjs/common";
import { ErrorCodes } from "./pdz-error-codes";
import { isPDZError, PDZError } from "./pdz-error";

describe("PDZError", () => {
  it("extends HttpException and carries the error definition's status", () => {
    const error = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(404);
  });

  it("exposes code, details, and a timestamp", () => {
    const before = Date.now();
    const error = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueKey: "spring" });
    const after = Date.now();

    expect(error.code).toBe("LR-001");
    expect(error.details).toEqual({ leagueKey: "spring" });
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it("leaves details undefined when none are provided", () => {
    const error = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);

    expect(error.details).toBeUndefined();
  });

  it("builds an HttpException response body with code/message, including details only when given", () => {
    const withDetails = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueKey: "spring" });
    expect(withDetails.getResponse()).toEqual({
      error: {
        code: "LR-001",
        message: "League not found",
        details: { leagueKey: "spring" },
      },
    });

    const withoutDetails = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
    expect(withoutDetails.getResponse()).toEqual({
      error: {
        code: "LR-001",
        message: "League not found",
      },
    });
  });
});

describe("isPDZError", () => {
  it("returns true for a PDZError instance", () => {
    expect(isPDZError(new PDZError(ErrorCodes.LEAGUE.NOT_FOUND))).toBe(true);
  });

  it("returns false for a plain HttpException", () => {
    expect(isPDZError(new HttpException("not found", 404))).toBe(false);
  });

  it("returns false for a plain Error or non-error value", () => {
    expect(isPDZError(new Error("oops"))).toBe(false);
    expect(isPDZError(null)).toBe(false);
    expect(isPDZError(undefined)).toBe(false);
    expect(isPDZError("error")).toBe(false);
  });
});
