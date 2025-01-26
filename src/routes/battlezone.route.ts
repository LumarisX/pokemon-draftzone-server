import type { Request, Response } from "express";
import { type Route } from ".";
import { BattleZone } from "../classes/battlezone";
import { PDBLModel } from "../models/pdbl.model";

export const BattleZoneRoutes: Route = {
  subpaths: {
    "/pdbl/signup": {
      post: async (req: Request, res: Response) => {
        try {
          const signup = BattleZone.validateSignUpForm(req.body);
          const existing = await PDBLModel.find({ name: signup.name });
          if (existing.length > 0)
            return res
              .status(409)
              .json({ message: "User is already signed up" });
          signup.toDocument().save();
          return res
            .status(201)
            .json({ message: "Sign up successfully created." });
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "BR-R1-01" });
        }
      },
    },
  },
};
