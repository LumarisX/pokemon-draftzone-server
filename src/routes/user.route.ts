import { Request, Response } from "express";
import { jwtCheck, Route, sendError } from ".";
import { getManagementToken } from "../services/auth0-services/auth0-service";

export const UserRoutes: Route = {
  middleware: [jwtCheck],
  subpaths: {
    "/settings": {
      patch: async (req: Request, res: Response) => {
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
