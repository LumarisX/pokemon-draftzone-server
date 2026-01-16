import { ID } from "@pkmn/data";
import { TextChannel } from "discord.js";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { Route, sendError } from ".";
import { logger } from "../app";
import { BattleZone } from "../classes/battlezone";
import { LeagueAd } from "../classes/league-ad";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset, Ruleset } from "../data/rulesets";
import { client } from "../discord";
import { jwtCheck } from "../middleware/jwtcheck";
import { rolecheck } from "../middleware/rolecheck";
import { LeagueAdModel } from "../models/league-ad.model";
import LeagueDivisionModel, {
  LeagueDivisionDocument,
} from "../models/league/division.model";
import LeagueModel, { LeagueDocument } from "../models/league/league.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  TeamDraft,
} from "../models/league/team.model";
import { DraftTierListDocument } from "../models/league/tier-list.model";
import { LeagueUser, LeagueUserDocument } from "../models/league/user.model";
import { PDBLModel } from "../models/pdbl.model";
import { getName } from "../services/data-services/pokedex.service";
import {
  draftPokemon,
  getDivisionDetails,
  isCoach,
  setDivsionState,
  skipCurrentPick,
} from "../services/league-services/draft-service";
import {
  getDrafted,
  getRoles,
  getTierList,
} from "../services/league-services/league-service";
import { getPokemonTier } from "../services/league-services/tier-service";
import { plannerCoverage } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import {
  getLeagueAds,
  invalidateLeagueAdsCache,
} from "../services/league-ad/league-ad-service";

const routeCode = "LR";

type LeagueResponse = Response & {
  league?: LeagueDocument | null;
  division?: LeagueDivisionDocument | null;
  team?: LeagueTeamDocument | null;
  ruleset?: Ruleset | null;
};

// Helper functions to ensure correct loading order for route params
async function loadLeagueByKey(req: Request, res: LeagueResponse) {
  if (res.league) return;
  const league = await LeagueModel.findOne({
    leagueKey: req.params.league_key,
  }).populate<{
    tierList: DraftTierListDocument;
  }>("tierList");
  if (!league) {
    logger.error(`League Key not found: ${req.params.league_key}`);
    res.status(404).json({
      message: "League Key not found.",
      code: `${routeCode}-P1-02`,
    });
    return;
  }
  res.league = league;
  res.ruleset = getRuleset(league.tierList.ruleset);
}

async function loadLeagueById(req: Request, res: LeagueResponse) {
  if (res.league) return;
  const league = await LeagueModel.findById(req.params.league_id).populate<{
    tierList: DraftTierListDocument;
  }>("tierList");
  if (!league) {
    logger.error(`League ID not found: ${req.params.league_id}`);
    res.status(404).json({
      message: "League ID not found.",
      code: `${routeCode}-P1-02`,
    });
    return;
  }
  res.league = league;
  res.ruleset = getRuleset(league.tierList.ruleset);
}

async function loadDivision(req: Request, res: LeagueResponse) {
  if (!res.league) {
    await (req.params.league_key
      ? loadLeagueByKey(req, res)
      : loadLeagueById(req, res));
    if (res.headersSent) return;
  }
  if (res.division) return;

  await res.league!.populate<{ divisions: LeagueDivisionDocument[] }>(
    "divisions"
  );

  const division_id = req.params.division_id;
  const division = (res.league!.divisions as LeagueDivisionDocument[]).find(
    (d) => d.divisionKey === division_id
  );

  if (!division) {
    res.status(404).json({ message: "Division not found in this league." });
    return;
  }

  await division.populate<{
    teams: LeagueTeamDocument[];
  }>("teams");

  res.division = division;
}

async function loadTeam(req: Request, res: LeagueResponse) {
  if (req.params.division_id && !res.division) {
    await loadDivision(req, res);
    if (res.headersSent) return;
  } else if (!req.params.division_id && !res.league) {
    await (req.params.league_key
      ? loadLeagueByKey(req, res)
      : loadLeagueById(req, res));
    if (res.headersSent) return;
  }

  if (res.team) return;

  const team_id = req.params.team_id;
  const team = await LeagueTeamModel.findById(team_id);

  if (!team) {
    res.status(404).json({ message: "Team not found." });
    return;
  }

  // This check is only possible if a division is loaded
  if (res.division && !res.division.teams.some((t) => t._id.equals(team._id))) {
    res.status(404).json({ message: "Team not found in this division." });
    return;
  }
  res.team = team;
}

export const LeagueRoutes: Route = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          res.json([]);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "LR-R1-01" });
        }
      },
    },

    "/bracket": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          const teamData: {
            teamName: string;
            coaches: string[];
            logo: string;
            seed: number;
          }[] = [
            {
              teamName: `Philadelphia Flygons`,
              coaches: ["02ThatOneGuy"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565385237-Philadelphia_Flygons.png",
              seed: 1,
            },
            {
              teamName: `Mighty Murkrow`,
              coaches: ["hsoj"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097094680-Mighty Murkrow.png",
              seed: 5,
            },
            {
              teamName: `Fitchburg's Sun Chasers`,
              coaches: ["Feather"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565484354-Fitchburgs_Sun_Chaser.png",
              seed: 2,
            },
            {
              teamName: `Chicago White Fox`,
              coaches: ["TheNotoriousABS"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565596549-Chicago_Ninetales.png",
              seed: 8,
            },
            {
              teamName: `Deimos Deoxys`,
              coaches: ["Lumaris"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1744422916695-DeimosDeoxys.png",
              seed: 3,
            },
            {
              teamName: `Alpine Arcanines`,
              coaches: ["Lion"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565450693-AlpineArcanines.png",
              seed: 4,
            },
            {
              teamName: `Victorious Vigoroths`,
              coaches: ["Speedy"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097393478-Victorious_Vigoroths.png",
              seed: 7,
            },
            {
              teamName: `Deep Sea Duskulls`,
              coaches: ["Emeglebon"],
              logo: "",
              seed: 9,
            },
            {
              teamName: `Twinleaf Tatsugiri`,
              coaches: ["Penic"],
              logo: "",
              seed: 10,
            },
            {
              teamName: `I like 'em THICC`,
              coaches: ["Kat"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565503663-I_like_em_THICC.png",
              seed: 6,
            },
            {
              teamName: `London Vespiquens`,
              coaches: ["Jake W"],
              logo: "",
              seed: 11,
            },
            {
              teamName: `Tampa T-Chainz`,
              coaches: ["Spite"],
              logo: "",
              seed: 12,
            },
            {
              teamName: `Kalos Quagsires`,
              coaches: ["Caltech_"],
              logo: "",
              seed: 13,
            },
            {
              teamName: `Montreal Mean Mareanies`,
              coaches: ["Qofol"],
              logo: "",
              seed: 14,
            },
            {
              teamName: `Chicago Sky Attack`,
              coaches: ["Quincy"],
              logo: "",
              seed: 15,
            },
            {
              teamName: `Midnight Teddy's`,
              coaches: ["neb5"],
              logo: "",
              seed: 16,
            },
            {
              teamName: `Moochelin Star Chefs`,
              coaches: ["Rai"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565579136-Moochelin_Star_Chefs.png",
              seed: 17,
            },
            {
              teamName: `Kalamazoo Komalas`,
              coaches: ["SuperSpiderPig"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565551389-Kalamazoo_Komalas.png",
              seed: 18,
            },
            {
              teamName: `Jokic Lokix`,
              coaches: ["Dotexe"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565520216-Jokic_Lokix.png",
              seed: 19,
            },
            {
              teamName: `Jimothy Jirachi Tomfoolery`,
              coaches: ["Jimothy J"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565565925-Jimothy_Jirachi.png",
              seed: 20,
            },
            {
              teamName: `Memphis Bloodmoons`,
              coaches: ["Steven"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565465031-Memphis_Bloodmoons.png",
              seed: 21,
            },
            {
              teamName: `F.C. Monterayquaza`,
              coaches: ["ChristianDeputy"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565535075-F.C._Monterrayquaza.png",
              seed: 22,
            },
            {
              teamName: `Chicago White Sawks`,
              coaches: ["BR@D"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565766076-Chicago_White_SawksBrad.png",
              seed: 23,
            },
            {
              teamName: `Bug Brigade`,
              coaches: ["TheNPC420"],
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565423936-Bug_Brigade.png",
              seed: 24,
            },
            {
              teamName: `Minnesota Lycanrocs`,
              coaches: ["SpiralBB"],
              logo: "",
              seed: 25,
            },
            {
              teamName: `Seattle Supersonics`,
              coaches: ["AwesomenessGuy"],
              logo: "",
              seed: 26,
            },
            {
              teamName: `Fairview Floatzels`,
              coaches: ["Lupa"],
              logo: "",
              seed: 27,
            },
            {
              teamName: `McTesuda's`,
              coaches: ["Lewis"],
              logo: "",
              seed: 28,
            },
            {
              teamName: `Pacifidlog Pichus`,
              coaches: ["13Luken"],
              logo: "",
              seed: 29,
            },
            {
              teamName: `Mossdeep City Sharpedos`,
              coaches: ["Travis"],
              logo: "",
              seed: 30,
            },
            {
              teamName: `Texas Thousand`,
              coaches: ["CheesyBP"],
              logo: "",
              seed: 31,
            },
            {
              teamName: `Kommo-o Kommanders`,
              coaches: ["AnimaSean"],
              logo: "",
              seed: 32,
            },
          ];

          const normalized24 = {
            format: "single-elim",
            teams: teamData
              .map((t) => ({
                teamName: t.teamName,
                coachName: t.coaches[0],
                seed: t.seed,
                logo: t.logo,
              }))
              .filter((t) => t.seed <= 24)
              .sort((a, b) => a.seed - b.seed),
            matches: [
              {
                id: "R1M1",
                round: 1,
                position: 1,
                a: { type: "seed", seed: 9 },
                b: { type: "seed", seed: 24 },
              },
              {
                id: "R1M2",
                round: 1,
                position: 2,
                a: { type: "seed", seed: 16 },
                b: { type: "seed", seed: 17 },
              },
              {
                id: "R1M3",
                round: 1,
                position: 3,
                a: { type: "seed", seed: 12 },
                b: { type: "seed", seed: 21 },
              },
              {
                id: "R1M4",
                round: 1,
                position: 4,
                a: { type: "seed", seed: 13 },
                b: { type: "seed", seed: 20 },
              },
              {
                id: "R1M5",
                round: 1,
                position: 5,
                a: { type: "seed", seed: 10 },
                b: { type: "seed", seed: 23 },
              },
              {
                id: "R1M6",
                round: 1,
                position: 6,
                a: { type: "seed", seed: 15 },
                b: { type: "seed", seed: 18 },
              },
              {
                id: "R1M7",
                round: 1,
                position: 7,
                a: { type: "seed", seed: 11 },
                b: { type: "seed", seed: 22 },
              },
              {
                id: "R1M8",
                round: 1,
                position: 8,
                a: { type: "seed", seed: 14 },
                b: { type: "seed", seed: 19 },
              },
              {
                id: "R2M1",
                round: 2,
                position: 1,
                a: { type: "seed", seed: 1 },
                b: { type: "winner", from: "R1M1" },
              },
              {
                id: "R2M2",
                round: 2,
                position: 2,
                a: { type: "seed", seed: 8 },
                b: { type: "winner", from: "R1M2" },
              },
              {
                id: "R2M3",
                round: 2,
                position: 3,
                a: { type: "seed", seed: 5 },
                b: { type: "winner", from: "R1M3" },
              },
              {
                id: "R2M4",
                round: 2,
                position: 4,
                a: { type: "seed", seed: 4 },
                b: { type: "winner", from: "R1M4" },
              },
              {
                id: "R2M5",
                round: 2,
                position: 5,
                a: { type: "seed", seed: 2 },
                b: { type: "winner", from: "R1M5" },
              },
              {
                id: "R2M6",
                round: 2,
                position: 6,
                a: { type: "seed", seed: 7 },
                b: { type: "winner", from: "R1M6" },
              },
              {
                id: "R2M7",
                round: 2,
                position: 7,
                a: { type: "seed", seed: 6 },
                b: { type: "winner", from: "R1M7" },
              },
              {
                id: "R2M8",
                round: 2,
                position: 8,
                a: { type: "seed", seed: 3 },
                b: { type: "winner", from: "R1M8" },
              },
              {
                id: "R3M1",
                round: 3,
                position: 1,
                a: { type: "winner", from: "R2M1" },
                b: { type: "winner", from: "R2M2" },
              },
              {
                id: "R3M2",
                round: 3,
                position: 2,
                a: { type: "winner", from: "R2M3" },
                b: { type: "winner", from: "R2M4" },
              },
              {
                id: "R3M3",
                round: 3,
                position: 3,
                a: { type: "winner", from: "R2M5" },
                b: { type: "winner", from: "R2M6" },
              },
              {
                id: "R3M4",
                round: 3,
                position: 4,
                a: { type: "winner", from: "R2M7" },
                b: { type: "winner", from: "R2M8" },
              },
              {
                id: "R4M1",
                round: 4,
                position: 1,
                a: { type: "winner", from: "R3M1" },
                b: { type: "winner", from: "R3M2" },
              },
              {
                id: "R4M2",
                round: 4,
                position: 2,
                a: { type: "winner", from: "R3M3" },
                b: { type: "winner", from: "R3M4" },
              },
              {
                id: "R5M1",
                round: 5,
                position: 1,
                a: { type: "winner", from: "R4M1" },
                b: { type: "winner", from: "R4M2" },
              },
            ],
          };

          res.json(normalized24);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
        }
      },
    },
    "/ad-list": {
      get: async function (req: Request, res: Response) {
        try {
          const leagueAds = await getLeagueAds();
          res.json(leagueAds);
        } catch (error) {
          logger.error("Error fetching league ads:", error);
          return sendError(res, 500, error as Error, `${routeCode}-AL-01`);
        }
      },
    },
    "/ad-list/manage": {
      get: async function (req: Request, res: Response) {
        try {
          const owner = req.auth?.payload.sub;
          if (!owner) {
            return sendError(
              res,
              401,
              new Error("Unauthorized"),
              `${routeCode}-AL-05`
            );
          }

          const documents = await LeagueAdModel.find({ owner }).sort({
            createdAt: -1,
          });

          const leagueAds = documents.map((doc) => LeagueAd.fromDocument(doc));
          res.json(leagueAds);
        } catch (error) {
          logger.error("Error fetching user's league ads:", error);
          return sendError(res, 500, error as Error, `${routeCode}-AL-06`);
        }
      },
      post: async function (req: Request, res: Response) {
        try {
          const owner = req.auth?.payload.sub;
          if (!owner) {
            return sendError(
              res,
              401,
              new Error("Unauthorized"),
              `${routeCode}-AL-02`
            );
          }

          const leagueAd = LeagueAd.fromForm(req.body, owner);

          if (!leagueAd.isValid()) {
            return sendError(
              res,
              400,
              new Error("Invalid league ad data"),
              `${routeCode}-AL-03`
            );
          }

          const document = await leagueAd.toDocument();
          await document.save();

          invalidateLeagueAdsCache();
          logger.info(`New league ad created: ${document._id}`);
          res.status(201).json({ _id: document._id, status: document.status });
        } catch (error) {
          logger.error("Error creating league ad:", error);
          return sendError(res, 500, error as Error, `${routeCode}-AL-04`);
        }
      },
      middleware: [jwtCheck],
    },
    "/ad-list/manage/:ad_id": {
      delete: async function (req: Request, res: Response) {
        try {
          const owner = req.auth?.payload.sub;
          if (!owner) {
            return sendError(
              res,
              401,
              new Error("Unauthorized"),
              `${routeCode}-AL-07`
            );
          }

          const ad = await LeagueAdModel.findById(req.params.ad_id);

          if (!ad) {
            return sendError(
              res,
              404,
              new Error("Ad not found"),
              `${routeCode}-AL-08`
            );
          }

          if (ad.owner !== owner) {
            return sendError(
              res,
              403,
              new Error("You can only delete your own ads"),
              `${routeCode}-AL-09`
            );
          }

          await LeagueAdModel.findByIdAndDelete(req.params.ad_id);
          invalidateLeagueAdsCache();
          logger.info(`League ad deleted: ${req.params.ad_id}`);
          res.status(200).json({ message: "Ad deleted successfully" });
        } catch (error) {
          logger.error("Error deleting league ad:", error);
          return sendError(res, 500, error as Error, `${routeCode}-AL-10`);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/roles": {
      get: async function (req: Request, res: Response) {
        try {
          res.json(getRoles(req.auth?.payload.sub));
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-01`);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/rules": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          res.json(res.league!.rules);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
        }
      },
    },
    "/:league_key/tier-list": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          const { division } = req.query;
          const tierList = await getTierList(res.league!);
          const divisions = await getDrafted(
            res.league!,
            division as string | string[]
          );
          res.json({ tierList, divisions });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
        }
      },
    },

    "/:league_key/teams/:team_id": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          const team = await LeagueTeamModel.findById(req.params["team_id"]!);
          if (!team) {
            return sendError(
              res,
              404,
              new Error("Team not found."),
              `${routeCode}-R2-02`
            );
          }

          await res.league!.populate<{
            tierList: DraftTierListDocument;
          }>("tierList");
          const tierList = res.league!.tierList as DraftTierListDocument;

          const draft = await Promise.all(
            team.draft.map(async (draftItem) => {
              const tier = await getPokemonTier(
                res.league!,
                draftItem.pokemonId
              );
              const pokemonName = getName(draftItem.pokemonId);
              return {
                id: draftItem.pokemonId,
                name: pokemonName,
                tier,
              };
            })
          );

          const picks: { id: string; name: string; tier?: string }[][] = [];
          for (let i = 0; i < tierList.draftCount[1] - draft.length; i++) {
            picks.push(
              await Promise.all(
                team.picks[i].map(async (pick) => {
                  const tier = await getPokemonTier(res.league!, pick);
                  return {
                    id: pick,
                    name: getName(pick),
                    tier,
                  };
                }) ?? []
              )
            );
          }
          res.json({
            name: team.name,
            timezone: team.timezone,
            logo: team.logo,
            draft,
            picks,
          });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
        }
      },
    },

    "/:league_key/divisions/:division_id/picks": {
      middleware: [jwtCheck],
      get: async function (req: Request, res: LeagueResponse) {
        try {
          if (!res.league) {
            return sendError(
              res,
              404,
              new Error("League not found."),
              `${routeCode}-R3-01`
            );
          }

          if (!res.division) {
            return sendError(
              res,
              404,
              new Error("Division not found in this league."),
              `${routeCode}-R3-02`
            );
          }

          const division = await LeagueDivisionModel.findById(
            res.division._id
          ).populate<{
            teams: (LeagueTeamDocument & {
              picks: Types.DocumentArray<
                TeamDraft & { picker: LeagueUserDocument }
              >;
              coaches: LeagueUserDocument[];
            })[];
          }>({
            path: "teams",
            populate: [
              {
                path: "draft.picker",
                model: "LeagueUser",
              },
              {
                path: "coaches",
                model: "LeagueUser",
              },
            ],
          });

          if (!division) {
            return sendError(
              res,
              404,
              new Error("Division not found."),
              `${routeCode}-R3-03`
            );
          }

          const allPicks = await Promise.all(
            division.teams.map(async (team) => {
              const picks = await Promise.all(
                team.draft.map(async (draftItem) => ({
                  pokemon: {
                    id: draftItem.pokemonId,
                    name: getName(draftItem.pokemonId),
                    tier: await getPokemonTier(
                      res.league!,
                      draftItem.pokemonId
                    ),
                  },
                  timestamp: draftItem.timestamp,
                  picker: (draftItem.picker as LeagueUser)?.auth0Id,
                }))
              );
              return {
                name: team.name,
                picks: picks,
                id: team._id.toString(),
              };
            })
          );

          res.json(allPicks);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R3-04`);
        }
      },
    },
    "/:league_key/divisions/:division_id": {
      middleware: [jwtCheck],
      get: async function (req: Request, res: LeagueResponse) {
        try {
          res.json(
            await getDivisionDetails(
              res.league!,
              res.division!,
              req.auth!.payload.sub!
            )
          );
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R3-04`);
        }
      },
    },
    "/:league_key/divisions/:division_id/order": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          if (!res.league) {
            return sendError(
              res,
              404,
              new Error("League not found."),
              `${routeCode}-R3-01`
            );
          }

          if (!res.division) {
            return sendError(
              res,
              404,
              new Error("Division not found in this league."),
              `${routeCode}-R3-02`
            );
          }

          const division = await LeagueDivisionModel.findById(
            res.division._id
          ).populate<{ teams: LeagueTeamDocument[] }>("teams");

          if (!division) {
            return sendError(
              res,
              404,
              new Error("Division not found."),
              `${routeCode}-R3-03`
            );
          }

          const draftStyle = division.draftStyle;
          const numberOfRounds = (res.league.tierList as DraftTierListDocument)
            .draftCount[1];
          const initialTeamOrder = division.teams;

          type DraftPick = {
            teamName: string;
            pokemon?: { id: string; name: string };
            skipTime?: Date;
          };

          type DraftRound = DraftPick[];

          const draftRounds: DraftRound[] = [];

          for (let round = 0; round < numberOfRounds; round++) {
            const currentRound: DraftPick[] = [];
            let pickingOrder = [...initialTeamOrder];

            if (draftStyle === "snake" && round % 2 === 1) {
              pickingOrder.reverse();
            }

            for (const [index, team] of pickingOrder.entries()) {
              const draftPick: DraftPick = { teamName: team.name };
              if (team.draft[round]) {
                const pokemonId = team.draft[round].pokemonId;
                const pokemonName = getName(pokemonId);
                draftPick.pokemon = { id: pokemonId, name: pokemonName };
              }
              if (
                division.draftCounter ===
                round * pickingOrder.length + index
              ) {
                // TODO: remove random for production
                // draftPick.skipTime = division.skipTime
                const now = new Date();
                const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
                const randomOffsetMinutes = Math.random() * 20 - 10; // Random number between -10 and +10
                const randomOffsetMilliseconds =
                  randomOffsetMinutes * 60 * 1000; // Convert to milliseconds
                draftPick.skipTime = new Date(
                  now.getTime() + thirtyMinutes + randomOffsetMilliseconds
                );
              }
              currentRound.push(draftPick);
            }
            draftRounds.push(currentRound);
          }

          res.json(draftRounds);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R3-04`);
        }
      },
    },
    "/:league_key/divisions/:division_id/power-rankings": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          const tierList = res.league!.tierList as DraftTierListDocument;
          const ruleset = getRuleset(tierList.ruleset);
          const teams = await Promise.all(
            (res.division!.teams as LeagueTeamDocument[]).map(
              async (team, index) => {
                const teamRaw = team.draft.map((pick) => ({
                  id: pick.pokemonId as ID,
                  capt: pick.capt,
                }));

                const draft = DraftSpecie.getTeam(teamRaw, ruleset);

                const typechart = new Typechart(draft);
                const summary = new SummaryClass(draft);
                return {
                  info: {
                    name: team.name,
                    index,
                    id: team._id.toString(),
                  },
                  typechart: typechart.toJson(),
                  recommended: typechart.recommended(),
                  summary: summary.toJson(),
                  movechart: await movechart(draft, ruleset),
                  coverage: await plannerCoverage(draft),
                };
              }
            )
          );
          return res.json(teams);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-02`);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/divisions/:division_id/teams/:team_id/draft": {
      post: async function (req: Request, res: LeagueResponse) {
        try {
          const { pokemonId } = req.body;
          if (!pokemonId) {
            return res.status(400).json({
              message: "Missing required fields: pokemonId",
            });
          }

          if (!(await isCoach(res.team!, req.auth!.payload.sub!))) {
            return res
              .status(403)
              .json({ message: "User is not a coach on this team." });
          }

          await draftPokemon(res.league!, res.division!, res.team!, pokemonId);

          return res.status(200).json({ message: "Drafted successfully." });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-02`);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/divisions/:division_id/teams/:team_id/picks": {
      post: async function (req: Request, res: LeagueResponse) {
        try {
          res.team!.picks = req.body.picks;
          await res.team!.save();
          return res
            .status(200)
            .json({ message: "Draft pick set successfully." });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-02`);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/manage/divisions/:division_id/state": {
      post: async function (req: Request, res: LeagueResponse) {
        try {
          const { state } = req.body;
          setDivsionState(res.league!, res.division!, state);
          return res.status(200).json({ message: "Timer set successfully." });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-02`);
        }
      },
      middleware: [jwtCheck, rolecheck("organizer")],
    },
    "/:league_key/manage/divisions/:division_id/skip": {
      post: async function (req: Request, res: LeagueResponse) {
        try {
          await skipCurrentPick(res.league!, res.division!);
          return res.status(200).json({ message: "Skip successful." });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-02`);
        }
      },
      middleware: [jwtCheck, rolecheck("organizer")],
    },
    "/:league_key/manage/divisions/:division_id/setdraft": {
      post: async function (req: Request, res: LeagueResponse) {
        try {
          const { pokemonId, teamId } = req.body;

          if (!pokemonId || !teamId) {
            return res.status(400).json({
              message: "Missing required fields: divisionId, pokemonId, teamId",
            });
          }

          const team = res.division!.teams.find((team) =>
            team._id.equals(teamId)
          ) as LeagueTeamDocument | undefined;
          if (!team) {
            return res.status(400).json({
              message: "Team Id not found",
            });
          }
          await draftPokemon(res.league!, res.division!, team, pokemonId);

          return res
            .status(200)
            .json({ message: "Draft pick set successfully." });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-02`);
        }
      },
      middleware: [jwtCheck, rolecheck("organizer")],
    },
    "/:league_key/signup": {
      get: async function (req: Request, res: Response) {
        try {
          const responses = await PDBLModel.find();
          res.json(responses);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-03`);
        }
      },
      post: async (req: Request, res: Response) => {
        try {
          const signup = BattleZone.validateSignUpForm(
            req.body,
            req.auth!.payload.sub!
          );
          const existing = await PDBLModel.findOne({ sub: signup.sub });
          if (existing)
            return res
              .status(409)
              .json({ message: "User is already signed up" });
          await signup.toDocument().save();
          if (client) {
            const totalSignups = await PDBLModel.countDocuments();
            const guild = await client.guilds.fetch("1183936734719922176");
            if (!guild) {
              console.error("Guild not found");
            } else {
              // Fetch the channel from the guild
              const channel = guild.channels.cache.get(
                "1303896194187132978"
              ) as TextChannel;
              if (!channel || !channel.isTextBased()) {
                console.error("Channel not found or not a text channel");
              } else {
                // Send a message in the designated channel
                channel.send(
                  `${signup.name} signed up for the league. Total sign-ups: ${totalSignups}.`
                );
              }
            }
          }
          return res.status(201).json({ message: "Sign up successful." });
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "BR-R1-01" });
        }
      },
      middleware: [jwtCheck],
    },
  },
  params: {
    league_id: async function (
      req: Request,
      res: LeagueResponse,
      next,
      league_id
    ) {
      try {
        await loadLeagueById(req, res);
        if (!res.headersSent) {
          next();
        }
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
    },
    league_key: async function (
      req: Request,
      res: LeagueResponse,
      next,
      league_key
    ) {
      try {
        await loadLeagueByKey(req, res);
        if (!res.headersSent) {
          next();
        }
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
    },
    division_id: async function (
      req: Request,
      res: LeagueResponse,
      next,
      division_id
    ) {
      try {
        await loadDivision(req, res);
        if (!res.headersSent) {
          next();
        }
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
    },
    team_id: async function (req: Request, res: LeagueResponse, next, team_id) {
      try {
        await loadTeam(req, res);
        if (!res.headersSent) {
          next();
        }
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
    },
  },
};
