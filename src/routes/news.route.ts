import { Request, Response } from "express";
import { Router } from "express";
import { getNews } from "../services/news/news-service";

export const NewsRoute = Router();

NewsRoute.get("/", async (_req: Request, res: Response) => {
  try {
    const news = await getNews();
    res.json(news);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: (error as Error).message, code: "DT-R4-01" });
  }
});
