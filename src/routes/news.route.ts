import { Request, Response } from "express";
import { Route } from ".";
import { getNews } from "../services/news/news-service";

export const NewsRoutes: Route = {
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
