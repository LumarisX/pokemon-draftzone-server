// src/auth/jwt-auth.guard.ts
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest(err: any, user: any, info: any) {
    if (info) {
      this.logger.warn(`JWT auth failed: ${info.message}`);
    }

    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
