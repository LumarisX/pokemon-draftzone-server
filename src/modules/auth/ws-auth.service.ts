import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwksClient } from "jwks-rsa";
import jwt, { GetPublicKeyOrSecret, JwtPayload } from "jsonwebtoken";

@Injectable()
export class WsAuthService {
  private readonly jwks: JwksClient;
  private readonly issuer: string;
  private readonly audience?: string;

  constructor(configService: ConfigService) {
    this.issuer = configService.get<string>("AUTH0_ISSUER") ?? "";
    this.audience = configService.get<string>("AUTH0_AUDIENCE");
    this.jwks = new JwksClient({
      jwksUri: `${this.issuer}.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
    });
  }

  async subjectOf(token: unknown): Promise<string | null> {
    if (typeof token !== "string" || token.length === 0) return null;

    const signingKey: GetPublicKeyOrSecret = (header, callback) => {
      this.jwks
        .getSigningKey(header.kid)
        .then((key) => callback(null, key.getPublicKey()))
        .catch((error: Error) => callback(error));
    };

    try {
      const payload = await new Promise<JwtPayload | string | undefined>(
        (resolve, reject) =>
          jwt.verify(
            token,
            signingKey,
            {
              issuer: this.issuer,
              audience: this.audience,
              algorithms: ["RS256"],
            },
            (error, decoded) => (error ? reject(error) : resolve(decoded)),
          ),
      );
      return typeof payload === "object" && typeof payload.sub === "string"
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }
}
