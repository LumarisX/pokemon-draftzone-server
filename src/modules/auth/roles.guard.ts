import { UserRole } from "@modules/user/user.schema";
import { UserService } from "@modules/user/user.service";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const sub: string | undefined = context.switchToHttp().getRequest()
      .user?.sub;
    if (!sub) throw new UnauthorizedException();

    const user = await this.userService.getMe(sub);
    const roles = user.roles ?? [];
    const allowed = requiredRoles.some((role) => roles.includes(role));

    if (!allowed) {
      this.logger.warn(
        `Forbidden: ${sub} lacks required role(s) [${requiredRoles.join(", ")}]`,
      );
      throw new ForbiddenException("Insufficient role");
    }

    return true;
  }
}
