import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Tracks by authenticated user (JwtAuthGuard runs first and populates
 * req.user) instead of IP, so the limit follows a compromised/abusive
 * account rather than penalizing everyone behind the same NAT/IP.
 */
@Injectable()
export class UploadsThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.sub ?? req.ip;
  }
}
