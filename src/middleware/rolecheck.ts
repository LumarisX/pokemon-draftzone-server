import { NextFunction, Request, Response } from "express";
import { getRoles } from "../services/league-services/league-service";
import { sendError } from "../routes";

export function rolecheck(requiredRole: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    try {
      const sub = req.auth?.payload.sub;
      if (!sub) {
        return res
          .status(401)
          .json({ message: "Unauthorized: No user identifier found." });
      }

      const userRoles = getRoles(sub);

      if (userRoles.includes(requiredRole)) {
        return next();
      } else {
        return res.status(403).json({
          message: `Forbidden: You do not have the required '${requiredRole}' role.`,
        });
      }
    } catch (error) {
      return sendError(res, 500, error as Error, "ROLECHECK-01");
    }
  };
}
