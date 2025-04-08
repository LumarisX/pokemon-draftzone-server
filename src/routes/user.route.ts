import { Response } from "express";
import { getSub, jwtCheck, Route, sendError, SubRequest } from ".";
import { getManagementToken } from "../services/auth0-services/auth0-service";

export const UserRoutes: Route = {
  middleware: [jwtCheck, getSub],
  subpaths: {
    "/settings": {
      get: async (req: SubRequest, res: Response) => {
        try {
          const management = await getManagementToken();
          const user = (await management.users.get({ id: req.sub! })).data;
          return res.json(user.user_metadata.settings);
        } catch (error) {
          sendError(res, 500, error as Error, "UR-R2-01");
        }
      },
      patch: async (req: SubRequest, res: Response) => {
        try {
          if (typeof req.body !== "object")
            sendError(
              res,
              400,
              new Error("Body is not a valid object."),
              "UR-R2-01"
            );
          const management = await getManagementToken();
          await management.users.update(
            { id: req.sub! },
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
