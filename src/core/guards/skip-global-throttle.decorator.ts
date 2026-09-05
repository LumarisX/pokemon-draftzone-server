import { SetMetadata } from "@nestjs/common";

export const SKIP_GLOBAL_THROTTLE = "SKIP_GLOBAL_THROTTLE";

export const SkipGlobalThrottle = () => SetMetadata(SKIP_GLOBAL_THROTTLE, true);
