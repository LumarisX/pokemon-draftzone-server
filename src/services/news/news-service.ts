import { News, NewsDocument, NewsModel } from "../../models/news.model";

export async function getNews(): Promise<News[]> {
  const news: NewsDocument[] = await NewsModel.find()
    .sort({
      createdAt: -1,
    })
    .lean();
  return news;
}
