import { Request, Response } from "express";
import { RouteOld } from ".";
import { getNews } from "../services/news/news-service";
import { createRoute } from "./route-builder";

export const NewsRoutes: RouteOld = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          const news = await getNews();
          res.json(news);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "DT-R4-01" });
        }
      },
    },
  },
  params: {},
};

export const NewsRoute = createRoute()((r) => {
  r.get(async (ctx) => await getNews());
});
