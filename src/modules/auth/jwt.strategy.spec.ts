const mockPassportJwtSecret = jest.fn().mockReturnValue(jest.fn());

jest.mock("jwks-rsa", () => ({
  passportJwtSecret: mockPassportJwtSecret,
}));

import { ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./jwt.strategy";

function buildConfigService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe("JwtStrategy", () => {
  beforeEach(() => {
    mockPassportJwtSecret.mockClear();
  });

  describe("constructor wiring", () => {
    it("builds the JWKS URI by appending .well-known/jwks.json to the issuer", () => {
      new JwtStrategy(
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
      new JwtStrategy(buildConfigService({}));

      expect(mockPassportJwtSecret).toHaveBeenCalledWith({
        cache: true,
        rateLimit: true,
        jwksUri: ".well-known/jwks.json",
      });
    });

    it("passes the configured audience and issuer through to the verifier options", () => {
      const strategy = new JwtStrategy(
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
      const strategy = new JwtStrategy(
        buildConfigService({ AUTH0_ISSUER: "https://example.auth0.com/" }),
      );

      const token = (strategy as any)._jwtFromRequest({
        headers: { authorization: "Bearer abc123" },
      });

      expect(token).toBe("abc123");
    });
  });

  describe("validate", () => {
    it("narrows the JWT payload down to just the sub claim", async () => {
      const strategy = new JwtStrategy(
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

      expect(result).toEqual({ sub: "auth0|coach-1" });
    });
  });
});
