import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function secretsMatch(incoming: unknown, expected?: string): boolean {
  if (!expected || typeof incoming !== "string" || !incoming) return false;
  return timingSafeEqual(digest(incoming), digest(expected));
}

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new Logger(WebhookGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const validKey = this.configService.get<string>("AUTH0_WEBHOOK_SECRET");
    if (!secretsMatch(request.headers["x-api-key"], validKey)) {
      this.logger.error(
        `Rejected webhook call from ${request.ip}: invalid or missing x-api-key`,
      );
      throw new UnauthorizedException("Invalid or missing webhook secret");
    }
    return true;
  }
}
