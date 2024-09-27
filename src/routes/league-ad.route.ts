import type { Request, Response } from "express";
import type { Route } from ".";
import { LeagueAdModel } from "../models/leagues.model";

export const LeagueAdRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          // const leagues = await LeagueAdModel.find().sort({
          //   createdAt: -1,
          // });
          // res.json(
          //   leagues.map((rawLeague) => {
          //     let league = rawLeague.toObject();
          //     return league;
          //   })
          // );
          res.json([
            {
              _id: "66f4eea3d271ad3fdeb5c1ef",
              leagueName: "Pokémon Masters League",
              organizer: "Ash Ketchum",
              description:
                "The Pokémon Masters League is for experienced trainers looking to compete in a high-stakes environment. Weekly battles and cash prizes for top performers.",
              recruitmentStatus: "Open",
              hostPlatform: "Discord",
              serverLink: "https://discord.gg/pokemonmasters",
              divisions: [
                {
                  skillLevelRange: {
                    from: 0,
                    to: 1,
                  },
                  _id: "66f6ebdb88ce5483edaaeabf",
                  divisionName: "Pokeball Division",
                  cashValue: 3,
                  platform: "Pokémon Showdown",
                  format: "VGC",
                  description:
                    "For experienced players with solid competitive records.",
                },
                {
                  skillLevelRange: {
                    from: 1,
                    to: 2,
                  },
                  _id: "66f6ebdb88ce5483edaaeabf",
                  divisionName: "Ultra Division",
                  cashValue: 3,
                  platform: "Pokémon Showdown",
                  format: "VGC",
                  description:
                    "For experienced players with solid competitive records.",
                },
                {
                  skillLevelRange: {
                    from: 3,
                    to: 3,
                  },
                  _id: "66f6ebdb88ce5483edaaeabf",
                  divisionName: "Master Division",
                  cashValue: 3,
                  platform: "Pokémon Showdown",
                  format: "VGC",
                  description:
                    "For experienced players with solid competitive records.",
                },
                {
                  skillLevelRange: {
                    from: 0,
                    to: 3,
                  },
                  _id: "66f6ebdb88ce5483edaaeabf",
                  divisionName: "Wifi Division",
                  cashValue: 3,
                  platform: "Pokémon Showdown",
                  format: "VGC",
                  description:
                    "For experienced players with solid competitive records.",
                },
              ],
              signupLink: "https://pokemonmasters.com/signup",
              closesAt: "2024-10-15T23:59:00.000Z",
              seasonStart: "2024-11-01T00:00:00.000Z",
              seasonEnd: "2025-02-01T00:00:00.000Z",
              createdAt: "2024-09-25T12:00:00.000Z",
              updatedAt: "2024-09-25T12:00:00.000Z",
            },
            {
              _id: "66f4eea3d271ad3fdeb5c1f0",
              leagueName: "Battle Legends Circuit",
              organizer: "Gary Oak",
              description:
                "An intense competition for trainers looking to prove themselves as the next battle legends. Featuring multiple divisions and weekly tournaments.",
              recruitmentStatus: "Open",
              hostPlatform: "Battlefy",
              serverLink: "",
              divisions: [
                {
                  skillLevelRange: {
                    from: 1,
                    to: 3,
                  },
                  _id: "66f6ebdb88ce5483edaaeac0",
                  divisionName: "Elite Four Division",
                  cashValue: 2,
                  platform: "Scarlet/Violet",
                  format: "Singles",
                  description:
                    "Competitive division for trainers who have what it takes to go all the way.",
                },
              ],
              signupLink: "https://battlelegends.com/signup",
              closesAt: "2024-11-10T23:59:00.000Z",
              seasonStart: "2024-11-20T00:00:00.000Z",
              seasonEnd: "2025-03-20T00:00:00.000Z",
              createdAt: "2024-09-20T10:30:00.000Z",
              updatedAt: "2024-09-22T15:45:00.000Z",
            },
            {
              _id: "66f4eea3d271ad3fdeb5c1f1",
              leagueName: "Rookie Trainers Challenge",
              organizer: "Brock Harrison",
              description:
                "A beginner-friendly league designed for trainers just starting their competitive journey. No cash prizes, but tons of learning opportunities and fun battles!",
              recruitmentStatus: "Open",
              hostPlatform: "Discord",
              serverLink: "https://discord.gg/rookietrainers",
              divisions: [
                {
                  skillLevelRange: {
                    from: 0,
                    to: 1,
                  },
                  _id: "66f6ebdb88ce5483edaaeac1",
                  divisionName: "Novice Division",
                  cashValue: 0,
                  platform: "Scarlet/Violet",
                  format: "Other",
                  description:
                    "For trainers new to the competitive scene, focusing on casual battles and growth.",
                },
              ],
              signupLink: "https://rookietrainers.com/signup",
              closesAt: "2024-12-01T23:59:00.000Z",
              seasonStart: "2024-12-15T00:00:00.000Z",
              seasonEnd: "2025-01-30T00:00:00.000Z",
              createdAt: "2024-09-18T09:00:00.000Z",
              updatedAt: "2024-09-18T09:00:00.000Z",
            },
          ]);
        } catch (error) {
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R1-01" });
        }
      },
      post: async (req: Request, res: Response) => {},
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
