import { Request, Response } from "express";
import { Router } from "express";
import { jwtCheck } from "../middleware/jwtcheck";
import { getManagementToken } from "../services/auth0-services/auth0-service";

export const UserRoute = Router();

UserRoute.use(jwtCheck);

UserRoute.get("/settings", async (req: Request, res: Response) => {
  try {
    const management = await getManagementToken();
    const userId = req.auth!.payload.sub!!;
    const user = await management.users.get(userId);
    return res.status(200).json(user.user_metadata?.settings ?? null);
  } catch (error) {
    return res
      .status(500)
      .json({ message: (error as Error).message, code: "UR-R1-01" });
  }
});

UserRoute.patch("/settings", async (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res
        .status(400)
        .json({ message: "Body is not a valid object.", code: "UR-R2-01" });
    }

    const management = await getManagementToken();
    const userId = req.auth!.payload.sub!!;
    await management.users.update(userId, {
      user_metadata: { settings: req.body },
    });
    return res.status(201).json({ settings: req.body });
  } catch (error) {
    return res
      .status(500)
      .json({ message: (error as Error).message, code: "UR-R2-01" });
  }
});
