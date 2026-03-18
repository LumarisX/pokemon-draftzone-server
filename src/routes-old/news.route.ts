import { getNews } from "../services/news/news-service";
import { createRoute } from "./route-builder";

export const NewsRoute = createRoute()((r) => {
  r.get(async (ctx) => await getNews());
});
