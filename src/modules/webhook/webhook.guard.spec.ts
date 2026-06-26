import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WebhookGuard } from "./webhook.guard";

function buildContext(headers: Record<string, string | undefined>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function buildConfigService(secret: string | undefined) {
  return {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;
}

describe("WebhookGuard", () => {
  it("allows the request when the x-api-key header matches the configured secret", () => {
    const guard = new WebhookGuard(buildConfigService("shared-secret"));

    expect(guard.canActivate(buildContext({ "x-api-key": "shared-secret" }))).toBe(true);
  });

  it("rejects the request when the x-api-key header is missing", () => {
    const guard = new WebhookGuard(buildConfigService("shared-secret"));

    expect(() => guard.canActivate(buildContext({}))).toThrow(UnauthorizedException);
  });

  it("rejects the request when the x-api-key header doesn't match the configured secret", () => {
    const guard = new WebhookGuard(buildConfigService("shared-secret"));

    expect(() =>
      guard.canActivate(buildContext({ "x-api-key": "wrong-secret" })),
    ).toThrow(UnauthorizedException);
  });

  it("rejects the request even with a literal 'undefined' header value when no secret is configured", () => {
    const guard = new WebhookGuard(buildConfigService(undefined));

    expect(() =>
      guard.canActivate(buildContext({ "x-api-key": "undefined" })),
    ).toThrow(UnauthorizedException);
  });
});
