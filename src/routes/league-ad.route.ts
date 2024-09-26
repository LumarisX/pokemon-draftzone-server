import type { Request, Response } from "express";
import type { Route } from ".";
import { LeagueAdModel } from "../models/leagues.model";

export const LeagueAdRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          const leagues = await LeagueAdModel.find().sort({
            createdAt: -1,
          });
          res.json(
            leagues.map((rawLeague) => {
              let league = rawLeague.toObject();
              return league;
            })
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R1-01" });
        }
      },
      post: async (req: Request, res: Response) => {},
    },
    "/:leagueId": {
      get: async (req: Request, res: Response) => {
        try {
          const leagues = await LeagueAdModel.find().sort({
            createdAt: -1,
          });
          res.json(
            leagues.map((rawLeague) => {
              let league = rawLeague.toObject();
              return league;
            })
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R2-01" });
        }
      },
      patch: async (req: Request, res: Response) => {},
      delete: async (req: Request, res: Response) => {},
    },
  },
  params: {
    leagueId: () => {},
  },
};
