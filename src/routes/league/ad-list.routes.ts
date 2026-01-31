import { Request, Response } from "express";
import { RouteBuilder } from "./route-builder-v2";
import { jwtCheck } from "../../middleware/jwtcheck";
import { LeagueAdModel } from "../../models/league-ad.model";
import {
  getLeagueAds,
  invalidateLeagueAdsCache,
} from "../../services/league-ad/league-ad-service";
import { PDZError } from "../../errors/pdz-error";
import { ErrorCodes } from "../../errors/error-codes";

/**
 * Ad list routes as a composable module
 * This function adds ad-list routes to any RouteBuilder
 */
export function addAdListRoutes<TContext>(
  builder: RouteBuilder<TContext>,
): RouteBuilder<TContext> {
  return builder
    .get("/ad-list", async (req: Request, res: Response) => {
      const ads = await getLeagueAds();
      res.json(ads);
    })
    .scope({ auth: jwtCheck }, (auth) => {
      auth.get("/ad-list/manage", async (req: Request, res: Response) => {
        const userId = req.auth?.payload?.sub;
        if (!userId) {
          throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
        }

        const ads = await LeagueAdModel.find({
          commissioner: userId,
        }).populate<{ league: any }>("league", ["name", "leagueKey"]);

        res.json(
          ads.map((ad) => ({
            _id: ad._id,
            title: ad.title,
            description: ad.description,
            contactInfo: ad.contactInfo,
            lookingFor: ad.lookingFor,
            commissioner: ad.commissioner,
            league: ad.league,
            datePosted: ad.datePosted,
          })),
        );
      });

      auth.post("/ad-list/manage", async (req: Request, res: Response) => {
        const userId = req.auth?.payload?.sub;
        if (!userId) {
          throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
        }

        const newAd = new LeagueAdModel({
          commissioner: userId,
          title: req.body.title,
          description: req.body.description,
          contactInfo: req.body.contactInfo,
          lookingFor: req.body.lookingFor,
          league: req.body.league || null,
        });

        await newAd.save();
        await invalidateLeagueAdsCache();
        res.json({ success: true, ad: newAd });
      });

      auth.patch(
        "/ad-list/manage/:ad_id",
        async (req: Request, res: Response) => {
          const userId = req.auth?.payload?.sub;
          const adId = req.params.ad_id;

          const ad = await LeagueAdModel.findById(adId);
          if (!ad) {
            throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND, { adId });
          }

          if (ad.commissioner !== userId) {
            throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
          }

          ad.title = req.body.title ?? ad.title;
          ad.description = req.body.description ?? ad.description;
          ad.contactInfo = req.body.contactInfo ?? ad.contactInfo;
          ad.lookingFor = req.body.lookingFor ?? ad.lookingFor;
          ad.league = req.body.league ?? ad.league;

          await ad.save();
          await invalidateLeagueAdsCache();
          res.json({ success: true, ad });
        },
      );

      auth.delete(
        "/ad-list/manage/:ad_id",
        async (req: Request, res: Response) => {
          const userId = req.auth?.payload?.sub;
          const adId = req.params.ad_id;

          const ad = await LeagueAdModel.findById(adId);
          if (!ad) {
            throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND, { adId });
          }

          if (ad.commissioner !== userId) {
            throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
          }

          await LeagueAdModel.findByIdAndDelete(adId);
          await invalidateLeagueAdsCache();
          res.json({ success: true });
        },
      );
    });
}
