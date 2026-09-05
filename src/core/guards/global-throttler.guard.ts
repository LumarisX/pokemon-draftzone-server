import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { SKIP_GLOBAL_THROTTLE } from "./skip-global-throttle.decorator";

@Injectable()
export class GlobalThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_GLOBAL_THROTTLE,
      [context.getHandler(), context.getClass()],
    );

    return skip === true ? true : super.shouldSkip(context);
  }
}
