import type { Request, Response } from "express";
import { getSub, type Route, type SubRequest } from ".";
import { LeagueAd } from "../classes/leaguelist";
import { LeagueAdModel } from "../models/leaguelist.model";

export const LeagueAdRoutes: Route = {
  middleware: [getSub],
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          // const leagues = await LeagueAdModel.find({ status: "Approved" }).sort(
          //   {
          //     createdAt: -1,
          //   }
          // );
          // res.json(
          //   leagues.map((league) => LeagueAd.fromDocument(league.toObject()))
          // );

          const testData: LeagueAd[] = [
            new LeagueAd({
              leagueName: "Pokémon Masters League",
              owner: "Ash Ketchum",
              description:
                "The Pokémon Masters League is for experienced trainers looking to compete in a high-stakes environment. Weekly battles and cash prizes for top performers.",
              recruitmentStatus: "Open",
              hostLink: "https://discord.gg/pokemonmasters",
              divisions: [
                {
                  skillLevels: [0, 1],
                  divisionName: "Pokeball Division",
                  prizeValue: "3",
                  platform: "Pokémon Showdown",
                  format: "VGC",
                  ruleset: "Paldea Dex",
                  description:
                    "For experienced players with solid competitive records.",
                },
                {
                  skillLevels: [1, 2],
                  divisionName: "Ultra Division",
                  prizeValue: "3",
                  platform: "Pokémon Showdown",
                  format: "VGC",
                  ruleset: "Paldea Dex",
                  description:
                    "For experienced players with solid competitive records.",
                },
                {
                  skillLevels: [3],
                  divisionName: "Master Division",
                  prizeValue: "3",
                  platform: "Pokémon Showdown",
                  format: "VGC",
                  ruleset: "Paldea Dex",
                  description:
                    "For experienced players with solid competitive records.",
                },
                {
                  skillLevels: [0, 1, 2, 3],
                  divisionName: "Wifi Division",
                  prizeValue: "3",
                  platform: "Scarlet/Violet",
                  format: "VGC",
                  ruleset: "Paldea Dex",
                  description:
                    "For experienced players with solid competitive records.",
                },
              ],
              signupLink: "https://pokemonmasters.com/signup",
              closesAt: new Date("2024-10-15T23:59:00.000Z"),
              seasonStart: new Date("2024-11-01T00:00:00.000Z"),
              seasonEnd: new Date("2025-02-01T00:00:00.000Z"),
              createdAt: new Date("2024-09-25T12:00:00.000Z"),
              updatedAt: new Date("2024-09-25T12:00:00.000Z"),
            }),
            new LeagueAd({
              leagueName: "Battle Legends Circuit",
              owner: "Gary Oak",
              description:
                "An intense competition for trainers looking to prove themselves as the next battle legends. Featuring multiple divisions and weekly tournaments.",
              recruitmentStatus: "Open",
              hostLink: "https://battlefly.com/...",
              divisions: [
                {
                  skillLevels: [1, 2, 3],
                  divisionName: "Elite Four Division",
                  prizeValue: "2",
                  platform: "Scarlet/Violet",
                  format: "Singles",
                  ruleset: "Gen9 NatDex",
                  description:
                    "Competitive division for trainers who have what it takes to go all the way.",
                },
              ],
              signupLink: "https://battlelegends.com/signup",
              closesAt: new Date("2024-11-10T23:59:00.000Z"),
              seasonStart: new Date("2024-11-20T00:00:00.000Z"),
              seasonEnd: new Date("2025-03-20T00:00:00.000Z"),
              createdAt: new Date("2024-09-20T10:30:00.000Z"),
              updatedAt: new Date("2024-09-22T15:45:00.000Z"),
            }),
            new LeagueAd({
              leagueName: "Legacy Battles Challenge",
              owner: "Brock Harrison",
              description:
                "A beginner-friendly league designed for trainers to experience draft using triple battles!",
              recruitmentStatus: "Open",
              hostLink: "https://discord.gg/legacybattles",
              divisions: [
                {
                  skillLevels: [0, 1, 2, 3],
                  divisionName: "Kalos Division",
                  prizeValue: "0",
                  platform: "Pokémon Showdown",
                  format: "Other",
                  ruleset: "Kalos Dex",
                },
                {
                  skillLevels: [0, 1, 2, 3],
                  divisionName: "Paldea Division",
                  prizeValue: "0",
                  platform: "Pokémon Showdown",
                  format: "Other",
                  ruleset: "Paldea Dex",
                },
              ],
              signupLink: "https://rookietrainers.com/signup",
              closesAt: new Date("2024-12-01T23:59:00.000Z"),
              createdAt: new Date("2024-09-18T09:00:00.000Z"),
              updatedAt: new Date("2024-09-18T09:00:00.000Z"),
            }),
          ];
          res.json(testData);
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R1-01" });
        }
      },
      post: async (req: SubRequest, res: Response) => {
        try {
          const ad = LeagueAd.fromForm(req.body, req.sub!);
          if (ad.isValid()) {
            await (await ad.toDocument()).save();
            res.status(201).json({ message: "LeagueAd successfully created." });
          } else {
            res
              .status(400)
              .json({ message: "Invalid LeagueAd data.", code: "LR-R1-01" });
          }
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R1-02" });
        }
      },
    },
    "/:leagueId": {
      get: async (req: Request, res: Response) => {
        try {
          const leagues = await LeagueAdModel.find().sort({
            createdAt: -1,
          });
          res.json(
            leagues.map((rawLeague) => {
              let league = rawLeague.toObject();
              return league;
            })
          );
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R2-01" });
        }
      },
      patch: async (req: Request, res: Response) => {},
      delete: async (req: Request, res: Response) => {},
    },
  },
  params: {
    leagueId: () => {},
  },
};
