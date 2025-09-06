import { TextChannel } from "discord.js";
import type { Request, Response } from "express";
import { jwtCheck, type Route } from ".";
import { LeagueAd } from "../classes/leaguelist";
import { LeagueAdDocument, LeagueAdModel } from "../models/leaguelist.model";
import { getApprovedLeagues } from "../services/league-ad/league-ad-service";
import { client } from "../discord";

export const LeagueAdRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          const leagues = await getApprovedLeagues();
          res.json(leagues.map((league) => LeagueAd.fromDocument(league)));
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R1-01" });
        }
      },
    },
    "/manage": {
      get: async (req: Request, res: Response) => {
        try {
          const leagues: LeagueAdDocument[] = await LeagueAdModel.find({
            owner: req.auth!.payload.sub!,
          }).sort({
            createdAt: -1,
          });
          res.json(leagues.map((league) => LeagueAd.fromDocument(league)));
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R2-01" });
        }
      },
      post: async (req: Request, res: Response) => {
        try {
          const ad = LeagueAd.fromForm(req.body, req.auth!.payload.sub!!);
          if (ad.isValid()) {
            const doc = await ad.toDocument();
            await doc.save();
            //Send a message in the discord server that a new Ad was submitted
            if (client) {
              const guild = await client.guilds.fetch("1183936734719922176");
              if (!guild) {
                console.error("Guild not found");
                return;
              }

              // Fetch the channel from the guild
              const channel = guild.channels.cache.get(
                "1293333149471871108"
              ) as TextChannel;
              if (!channel || !channel.isTextBased()) {
                console.error("Channel not found or not a text channel");
                return;
              }

              // Send a message in the designated channel
              channel.send(
                `A new league ad has been submitted for **${ad.leagueName}** by ${ad.owner}.`
              );
            }
            res
              .status(201)
              .json({ message: "League ad successfully created." });
          } else {
            res
              .status(400)
              .json({ message: "Invalid league ad data.", code: "LR-R2-02" });
          }
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R2-03" });
        }
      },
      middleware: [jwtCheck],
    },
    "/:ad_id": {
      get: async (req: Request, res: Response) => {},
      patch: async (req: Request, res: Response) => {},
      delete: async (req: Request, res: Response) => {
        try {
          await res.locals.ad!.deleteOne();
          res.status(201).json({ message: "Draft deleted" });
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R3-02" });
        }
      },
      middleware: [jwtCheck],
    },
  },
  params: {
    ad_id: async (req: Request, res: Response, next, ad_id) => {
      try {
        if (!ad_id) {
          return res
            .status(400) // Bad Request
            .json({ message: "League ID not provided.", code: "LR-P1-01" });
        }
        const ad = await LeagueAdModel.findById(ad_id);
        if (!ad) {
          res
            .status(404) // Not Found
            .json({ message: "League ad not found.", code: "LR-P1-03" });
          next();
          return;
        }

        res.locals.ad = ad;
      } catch (error) {
        return res
          .status(500)
          .json({ message: (error as Error).message, code: "LR-P1-04" });
      }
      next();
    },
    time: async (req: Request, res: Response, next, time) => {
      try {
        if (!time) {
          return res
            .status(400) // Bad Request
            .json({ message: "Time not provided.", code: "LR-P2-01" });
        }
        res.set("time", time);
      } catch (error) {
        return res
          .status(500)
          .json({ message: (error as Error).message, code: "LR-P1-04" });
      }
      next();
    },
  },
};
