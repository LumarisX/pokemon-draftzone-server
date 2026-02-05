import { NextFunction, Request, Response } from "express";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { getRoles } from "../services/league-services/league-service";

export function rolecheck(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const sub = req.auth?.payload.sub;
    if (!sub) throw new PDZError(ErrorCodes.AUTH.INVALID_TOKEN);
    if (!getRoles(sub).includes(requiredRole))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    return next();
  };
}
