import { NextFunction, Request, Response } from "express";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { getRoles } from "../services/league-services/league-service";
import { LeagueTournamentDocument } from "../models/league/tournament.model";

export function rolecheck(
  tournament: LeagueTournamentDocument,
  requiredRole: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sub = req.auth?.payload.sub;
    if (!sub) throw new PDZError(ErrorCodes.AUTH.INVALID_TOKEN);
    const roles = await getRoles(tournament, sub);
    if (!roles.includes(requiredRole))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    return next();
  };
}
