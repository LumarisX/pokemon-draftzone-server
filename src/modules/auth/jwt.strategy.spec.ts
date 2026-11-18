const mockPassportJwtSecret = jest.fn().mockReturnValue(jest.fn());

jest.mock("jwks-rsa", () => ({
  passportJwtSecret: mockPassportJwtSecret,
}));

import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { UserService } from "@modules/user/user.service";
import { ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./jwt.strategy";

function buildConfigService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function makeStrategy(
  config: ConfigService,
  userService: Pick<UserService, "resolveAccount"> = {
    resolveAccount: jest.fn(async (signIn: string) => signIn),
  },
) {
  return new JwtStrategy(config, userService as UserService);
}

describe("JwtStrategy", () => {
  beforeEach(() => {
    mockPassportJwtSecret.mockClear();
  });

  describe("constructor wiring", () => {
    it("builds the JWKS URI by appending .well-known/jwks.json to the issuer", () => {
      makeStrategy(
        buildConfigService({
          AUTH0_ISSUER: "https://example.auth0.com/",
          AUTH0_AUDIENCE: "my-audience",
        }),
      );

      expect(mockPassportJwtSecret).toHaveBeenCalledWith({
        cache: true,
        rateLimit: true,
        jwksUri: "https://example.auth0.com/.well-known/jwks.json",
      });
    });

    it("falls back to an empty issuer when AUTH0_ISSUER is not configured", () => {
      makeStrategy(buildConfigService({}));

      expect(mockPassportJwtSecret).toHaveBeenCalledWith({
        cache: true,
        rateLimit: true,
        jwksUri: ".well-known/jwks.json",
      });
    });

    it("passes the configured audience and issuer through to the verifier options", () => {
      const strategy = makeStrategy(
        buildConfigService({
          AUTH0_ISSUER: "https://example.auth0.com/",
          AUTH0_AUDIENCE: "my-audience",
        }),
      );

      expect((strategy as any)._verifOpts).toMatchObject({
        audience: "my-audience",
        issuer: "https://example.auth0.com/",
        algorithms: ["RS256"],
      });
    });

    it("extracts the JWT from the Authorization bearer header", () => {
      const strategy = makeStrategy(
        buildConfigService({ AUTH0_ISSUER: "https://example.auth0.com/" }),
      );

      const token = (strategy as any)._jwtFromRequest({
        headers: { authorization: "Bearer abc123" },
      });

      expect(token).toBe("abc123");
    });
  });

  describe("validate", () => {
    it("hands the resolved account id on as sub and keeps the sign-in id apart", async () => {
      const resolveAccount = jest.fn().mockResolvedValue("65f0c0ffee0000000000abcd");
      const strategy = makeStrategy(
        buildConfigService({ AUTH0_ISSUER: "https://example.auth0.com/" }),
        { resolveAccount },
      );

      const result = await strategy.validate({
        sub: "google-oauth2|123",
        iss: "https://example.auth0.com/",
        aud: "my-audience",
        iat: 0,
        exp: 0,
      } as any);

      expect(resolveAccount).toHaveBeenCalledWith("google-oauth2|123");
      expect(result).toEqual({
        sub: "65f0c0ffee0000000000abcd",
        signIn: "google-oauth2|123",
      });
    });

    it("lets the blocked-sign-in error through so the guard can answer 403", async () => {
      const blocked = new PDZError(ErrorCodes.USER.SIGN_IN_BLOCKED);
      const strategy = makeStrategy(
        buildConfigService({ AUTH0_ISSUER: "https://example.auth0.com/" }),
        { resolveAccount: jest.fn().mockRejectedValue(blocked) },
      );

      await expect(
        strategy.validate({ sub: "google-oauth2|123" } as any),
      ).rejects.toBe(blocked);
    });

    it("narrows the JWT payload down to the sub and sign-in ids in auth0 mode", async () => {
      const strategy = makeStrategy(
        buildConfigService({ AUTH0_ISSUER: "https://example.auth0.com/" }),
      );

      const result = await strategy.validate({
        sub: "auth0|coach-1",
        iss: "https://example.auth0.com/",
        aud: "my-audience",
        iat: 0,
        exp: 0,
        extra: "should be dropped",
      } as any);

      expect(result).toEqual({ sub: "auth0|coach-1", signIn: "auth0|coach-1" });
    });
  });
});
