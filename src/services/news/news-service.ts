import NodeCache from "node-cache";
import { NewsDocument, NewsModel } from "../../models/news.model";

const cache = new NodeCache({ stdTTL: 3000 });

export async function getNews(): Promise<NewsDocument[]> {
  const cacheKey = "approvedLeagues";
  const cachedLeagues: NewsDocument[] | undefined = cache.get(cacheKey);

  if (cachedLeagues) return cachedLeagues;

  const news: NewsDocument[] = await NewsModel.find()
    .sort({
      createdAt: -1,
    })
    .lean();

  cache.set(cacheKey, news);
  return news;
}
