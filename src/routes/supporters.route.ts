import { Route } from ".";
import { SupporterModel } from "../models/supporters.model";
import { Request, Response } from "express";

export const SupporterRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          const today = new Date();
          const supporters = await SupporterModel.find({
            enabled: { $ne: false },
            $or: [
              { endDate: { $exists: false } },
              { endDate: { $gte: today } },
            ],
          }).lean();
          res.json(supporters);
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "SP-R1-01" });
        }
      },
    },
  },
};
