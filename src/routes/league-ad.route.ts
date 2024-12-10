import type { Request, Response } from "express";
import { getSub, jwtCheck, type Route, type SubRequest } from ".";
import { LeagueAd } from "../classes/leaguelist";
import { Document } from "mongoose";
import { LeagueAdDoc, LeagueAdModel } from "../models/leaguelist.model";
import { bot } from "..";
import { TextChannel } from "discord.js";

type AdResponse = Response & {
  //change back from any
  ad?: Document<unknown, {}, any>;
};

export const LeagueAdRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);

          const leagues = await LeagueAdModel.find({
            status: "Approved",
            closesAt: { $gte: today },
          }).sort({
            createdAt: -1,
          });
          res.json(
            leagues.map((league) =>
              LeagueAd.fromDocument(league.toObject() as LeagueAdDoc)
            )
          );
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R1-01" });
        }
      },
    },
    "/manage": {
      get: async (req: SubRequest, res: Response) => {
        try {
          const leagues = await LeagueAdModel.find({ owner: req.sub }).sort({
            createdAt: -1,
          });
          res.json(
            leagues.map((league) =>
              LeagueAd.fromDocument(league.toObject() as LeagueAdDoc)
            )
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R2-01" });
        }
      },
      post: async (req: SubRequest, res: Response) => {
        try {
          const ad = LeagueAd.fromForm(req.body, req.sub!);
          if (ad.isValid()) {
            await (await ad.toDocument()).save();
            //Send a message in the discord server that a new Ad was submitted
            if (bot) {
              const guild = await bot.guilds.fetch("1183936734719922176");
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
              channel.send(`A new league ad has been submitted:
              ${ad.toString()}`);
            }

            res.status(201).json({ message: "LeagueAd successfully created." });
          } else {
            res
              .status(400)
              .json({ message: "Invalid LeagueAd data.", code: "LR-R2-02" });
          }
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R2-03" });
        }
      },
      middleware: [jwtCheck, getSub],
    },
    "/:ad_id": {
      get: async (req: Request, res: Response) => {},
      patch: async (req: Request, res: Response) => {},
      delete: async (req: SubRequest, res: AdResponse) => {
        try {
          await res.ad!.deleteOne();
          res.status(201).json({ message: "Draft deleted" });
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R3-02" });
        }
      },
      middleware: [jwtCheck, getSub],
    },
  },
  params: {
    ad_id: async (req: SubRequest, res: AdResponse, next, ad_id) => {
      try {
        if (!ad_id) {
          return res
            .status(400)
            .json({ message: "League ID is nullish", code: "LR-P1-01" });
        }
        const ad = await LeagueAdModel.findById(ad_id);
        if (!ad) {
          res
            .status(400)
            .json({ message: "League ID not found", code: "LR-P1-03" });
          next();
          return;
        }

        res.ad = ad;
      } catch (error) {
        return res
          .status(500)
          .json({ message: (error as Error).message, code: "DR-P1-04" });
      }
      next();
    },
  },
};
