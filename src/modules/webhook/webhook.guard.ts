import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new Logger(WebhookGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const incomingKey = request.headers["x-api-key"];
    const validKey = this.configService.get<string>("AUTH0_WEBHOOK_SECRET");
    if (!incomingKey || incomingKey !== validKey) {
      this.logger.error(
        `Rejected webhook call from ${request.ip}: invalid or missing x-api-key`,
      );
      throw new UnauthorizedException("Invalid or missing webhook secret");
    }
    return true;
  }
}
