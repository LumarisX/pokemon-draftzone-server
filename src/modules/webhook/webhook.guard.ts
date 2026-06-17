import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const incomingKey = request.headers["x-api-key"];
    const validKey = this.configService.get<string>("AUTH0_WEBHOOK_SECRET");
    if (!incomingKey || incomingKey !== validKey)
      throw new UnauthorizedException("Invalid or missing webhook secret");
    return true;
  }
}
