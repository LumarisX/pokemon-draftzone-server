import { Request, Response } from "express";
import { Route } from ".";
import { Supporter, SupporterModel } from "../models/supporters.model";

export const SupporterRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          const today = new Date();
          const supporters: Supporter[] = await SupporterModel.find().lean();

          const supporterData = supporters.reduce(
            (data, supporter) => {
              const start = new Date(supporter.startDate);
              if (!supporter.tier) {
                const sTop = {
                  name: supporter.name,
                  amount: supporter.amount || 0,
                };
                data.top.all.push(sTop);
                const thirty = new Date(today);
                thirty.setDate(thirty.getDate() - 30);
                console.log(start, thirty);
                if (start > thirty) {
                  data.top.thirty.push(sTop);
                }
                return data;
              }
              const sTier = {
                name: supporter.name,
                months:
                  (today.getFullYear() - start.getFullYear()) * 12 +
                  today.getMonth() -
                  start.getMonth() +
                  (supporter.extraMonths || 0),
              };
              switch (supporter.tier) {
                case "Poké Ball":
                case "Poke Ball":
                  data.tiers.poke.push(sTier);
                  break;
                case "Premier Ball":
                  data.tiers.premier.push(sTier);
                  break;
                case "Great Ball":
                  data.tiers.great.push(sTier);
                  break;
                case "Ultra Ball":
                  data.tiers.ultra.push(sTier);
                  break;
                case "Luxury Ball":
                  data.tiers.luxury.push(sTier);
                  break;
                case "Master Ball":
                  data.tiers.master.push(sTier);
                  break;
              }
              return data;
            },
            {
              top: {
                all: [] as { name: string; amount: number }[],
                thirty: [] as { name: string; amount: number }[],
              },
              tiers: {
                poke: [] as { name: string; months: number }[],
                premier: [] as { name: string; months: number }[],
                great: [] as { name: string; months: number }[],
                ultra: [] as { name: string; months: number }[],
                luxury: [] as { name: string; months: number }[],
                master: [] as { name: string; months: number }[],
              },
            }
          );

          supporterData.top.all = supporterData.top.all
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
          supporterData.top.thirty = supporterData.top.thirty
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
          res.json(supporterData);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "SP-R1-01" });
        }
      },
    },
  },
};
