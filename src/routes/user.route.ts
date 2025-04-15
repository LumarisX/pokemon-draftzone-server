import { Request, Response } from "express";
import { jwtCheck, Route, sendError } from ".";
import { getManagementToken } from "../services/auth0-services/auth0-service";

export const UserRoutes: Route = {
  middleware: [jwtCheck],
  subpaths: {
    "/settings": {
      get: async (req: Request, res: Response) => {
        try {
          return res.json({});
          const management = await getManagementToken();
          const user = (
            await management.users.get({ id: req.auth!.payload.sub!! })
          ).data;
          return res.json(user.user_metadata.settings);
        } catch (error) {
          sendError(res, 500, error as Error, "UR-R2-01");
        }
      },
      patch: async (req: Request, res: Response) => {
        try {
          return res.status(201);
          if (typeof req.body !== "object")
            sendError(
              res,
              400,
              new Error("Body is not a valid object."),
              "UR-R2-01"
            );
          const management = await getManagementToken();
          await management.users.update(
            { id: req.auth!.payload.sub!! },
            { user_metadata: { settings: req.body } }
          );
          return res.status(201);
        } catch (error) {
          sendError(res, 500, error as Error, "UR-R2-01");
        }
      },
    },
  },
  params: {},
};
