import { Request, Response } from "express";
import { RouteOld, sendError } from ".";
import { jwtCheck } from "../middleware/jwtcheck";
import { getManagementToken } from "../services/auth0-services/auth0-service";

export const UserRoutes: RouteOld = {
  middleware: [jwtCheck],
  subpaths: {
    "/settings": {
      get: async (req: Request, res: Response) => {
        try {
          const management = await getManagementToken();
          const userId = req.auth!.payload.sub!!;
          const user = await management.users.get(userId);
          return res.status(200).json(user.user_metadata?.settings ?? null);
        } catch (error) {
          sendError(res, 500, error as Error, "UR-R1-01");
        }
      },
      patch: async (req: Request, res: Response) => {
        try {
          if (typeof req.body !== "object")
            return sendError(
              res,
              400,
              new Error("Body is not a valid object."),
              "UR-R2-01",
            );
          const management = await getManagementToken();
          const userId = req.auth!.payload.sub!!;
          await management.users.update(userId, {
            user_metadata: { settings: req.body },
          });
          return res.status(201).json({ settings: req.body });
        } catch (error) {
          sendError(res, 500, error as Error, "UR-R2-01");
        }
      },
    },
  },
  params: {},
};
