import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { passportJwtSecret } from "jwks-rsa";
import { ExtractJwt, Strategy } from "passport-jwt";

interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(private configService: ConfigService) {
    const issuer = configService.get<string>("AUTH0_ISSUER") ?? "";
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksUri: `${issuer}.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: configService.get<string>("AUTH0_AUDIENCE"),
      issuer,
      algorithms: ["RS256"],
    });
  }

  async validate(payload: JwtPayload) {
    return { sub: payload.sub };
  }
}
