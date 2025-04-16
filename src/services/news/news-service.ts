import NodeCache from "node-cache";
import { NewsDocument, NewsModel } from "../../models/news.model";

const cache = new NodeCache({ stdTTL: 3000 });

export async function getNews(): Promise<NewsDocument[]> {
  const cacheKey = "news";
  const cachedLeagues: NewsDocument[] | undefined = cache.get(cacheKey);

  if (cachedLeagues) {
    return cachedLeagues;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const news: NewsDocument[] = await NewsModel.find({})
    .sort({
      createdAt: -1,
    })
    .lean();
  cache.set(cacheKey, news);
  return news;
}
