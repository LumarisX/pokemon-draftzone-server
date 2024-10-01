import type { Request, Response } from "express";
import type { Route } from ".";
import { LeagueAdModel } from "../models/leaguelist.model";
import { LeagueAd } from "../classes/leaguelist";

export const LeagueAdRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          const leagues = await LeagueAdModel.find({ status: "Approved" }).sort(
            {
              createdAt: -1,
            }
          );

          res.json(leagues.map((league) => new LeagueAd(league.toObject())));
          // res.json([
          //   {
          //     _id: "66f4eea3d271ad3fdeb5c1ef",
          //     leagueName: "Pokémon Masters League",
          //     organizer: "Ash Ketchum",
          //     description:
          //       "The Pokémon Masters League is for experienced trainers looking to compete in a high-stakes environment. Weekly battles and cash prizes for top performers.",
          //     recruitmentStatus: "Open",
          //     hostLink: "https://discord.gg/pokemonmasters",
          //     divisions: [
          //       {
          //         skillLevelRange: {
          //           from: 0,
          //           to: 1,
          //         },
          //         divisionName: "Pokeball Division",
          //         prizeValue: 3,
          //         platform: "Pokémon Showdown",
          //         format: "VGC",
          //         ruleset: "Paldea Dex",
          //         description:
          //           "For experienced players with solid competitive records.",
          //       },
          //       {
          //         skillLevelRange: {
          //           from: 1,
          //           to: 2,
          //         },
          //         divisionName: "Ultra Division",
          //         prizeValue: 3,
          //         platform: "Pokémon Showdown",
          //         format: "VGC",
          //         ruleset: "Paldea Dex",
          //         description:
          //           "For experienced players with solid competitive records.",
          //       },
          //       {
          //         skillLevelRange: {
          //           from: 3,
          //           to: 3,
          //         },
          //         divisionName: "Master Division",
          //         prizeValue: 3,
          //         platform: "Pokémon Showdown",
          //         format: "VGC",
          //         ruleset: "Paldea Dex",
          //         description:
          //           "For experienced players with solid competitive records.",
          //       },
          //       {
          //         skillLevelRange: {
          //           from: 0,
          //           to: 3,
          //         },
          //         divisionName: "Wifi Division",
          //         prizeValue: 3,
          //         platform: "Scarlet/Violet",
          //         format: "VGC",
          //         ruleset: "Paldea Dex",
          //         description:
          //           "For experienced players with solid competitive records.",
          //       },
          //     ],
          //     status: "Approved",
          //     signupLink: "https://pokemonmasters.com/signup",
          //     closesAt: "2024-10-15T23:59:00.000Z",
          //     seasonStart: "2024-11-01T00:00:00.000Z",
          //     seasonEnd: "2025-02-01T00:00:00.000Z",
          //     createdAt: "2024-09-25T12:00:00.000Z",
          //     updatedAt: "2024-09-25T12:00:00.000Z",
          //   },
          //   {
          //     _id: "66f4eea3d271ad3fdeb5c1f0",
          //     leagueName: "Battle Legends Circuit",
          //     organizer: "Gary Oak",
          //     description:
          //       "An intense competition for trainers looking to prove themselves as the next battle legends. Featuring multiple divisions and weekly tournaments.",
          //     recruitmentStatus: "Open",
          //     hostLink: "https://battlefly.com/...",
          //     divisions: [
          //       {
          //         skillLevelRange: {
          //           from: 1,
          //           to: 3,
          //         },
          //         divisionName: "Elite Four Division",
          //         prizeValue: 2,
          //         platform: "Scarlet/Violet",
          //         format: "Singles",
          //         ruleset: "Gen9 NatDex",
          //         description:
          //           "Competitive division for trainers who have what it takes to go all the way.",
          //       },
          //     ],
          //     status: "Approved",
          //     signupLink: "https://battlelegends.com/signup",
          //     closesAt: "2024-11-10T23:59:00.000Z",
          //     seasonStart: "2024-11-20T00:00:00.000Z",
          //     seasonEnd: "2025-03-20T00:00:00.000Z",
          //     createdAt: "2024-09-20T10:30:00.000Z",
          //     updatedAt: "2024-09-22T15:45:00.000Z",
          //   },
          //   {
          //     _id: "66f4eea3d271ad3fdeb5c1f1",
          //     leagueName: "Legacy Battles Challenge",
          //     organizer: "Brock Harrison",
          //     description:
          //       "A beginner-friendly league designed for trainers to experience draft using triple battles!",
          //     recruitmentStatus: "Open",
          //     hostLink: "https://discord.gg/legacybattles",
          //     divisions: [
          //       {
          //         skillLevelRange: {
          //           from: 0,
          //           to: 3,
          //         },
          //         divisionName: "Kalos Division",
          //         prizeValue: 0,
          //         platform: "Pokemon Showdown",
          //         format: "Other",
          //         ruleset: "Kalos Dex",
          //       },
          //       {
          //         skillLevelRange: {
          //           from: 0,
          //           to: 3,
          //         },
          //         divisionName: "Paldea Division",
          //         prizeValue: 0,
          //         platform: "Pokemon Showdown",
          //         format: "Other",
          //         ruleset: "Paldea Dex",
          //       },
          //     ],
          //     status: "Approved",
          //     signupLink: "https://rookietrainers.com/signup",
          //     closesAt: "2024-12-01T23:59:00.000Z",
          //     createdAt: "2024-09-18T09:00:00.000Z",
          //     updatedAt: "2024-09-18T09:00:00.000Z",
          //   },
          // ]);
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
