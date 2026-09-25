const getSigningKey = jest.fn();
jest.mock("jwks-rsa", () => ({
  JwksClient: jest.fn(() => ({ getSigningKey })),
}));
jest.mock("jsonwebtoken", () => ({ __esModule: true, default: { verify: jest.fn() } }));

import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";
import { WsAuthService } from "./ws-auth.service";

const verify = jwt.verify as unknown as jest.Mock;

function buildService() {
  return new WsAuthService({
    get: (key: string) =>
      ({
        AUTH0_ISSUER: "https://example.auth0.com/",
        AUTH0_AUDIENCE: "my-audience",
      })[key],
  } as unknown as ConfigService);
}

describe("WsAuthService", () => {
  it("returns no subject for a missing token without verifying anything", async () => {
    const service = buildService();

    await expect(service.subjectOf(undefined)).resolves.toBeNull();
    await expect(service.subjectOf("")).resolves.toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns the sub of a token that verifies against the issuer and audience", async () => {
    verify.mockImplementation((_token, _key, options, callback) => {
      expect(options).toEqual({
        issuer: "https://example.auth0.com/",
        audience: "my-audience",
        algorithms: ["RS256"],
      });
      callback(null, { sub: "auth0|coach" });
    });

    await expect(buildService().subjectOf("good-token")).resolves.toBe(
      "auth0|coach",
    );
  });

  it("treats a token that fails verification as anonymous", async () => {
    verify.mockImplementation((_token, _key, _options, callback) =>
      callback(new Error("jwt expired")),
    );

    await expect(buildService().subjectOf("expired-token")).resolves.toBeNull();
  });
});
