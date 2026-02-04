import { TextChannel } from "discord.js";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { RouteOld } from ".";
import { logger } from "../app";
import { BattleZone } from "../classes/battlezone";
import { LeagueAd } from "../classes/league-ad";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset, Ruleset } from "../data/rulesets";
import { client } from "../discord";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { jwtCheck } from "../middleware/jwtcheck";
import { rolecheck } from "../middleware/rolecheck";
import { LeagueAdModel } from "../models/league-ad.model";
import LeagueCoachModel, {
  LeagueCoach,
  LeagueCoachDocument,
} from "../models/league/coach.model";
import LeagueDivisionModel, {
  LeagueDivisionDocument,
} from "../models/league/division.model";
import { LeagueMatchupModel } from "../models/league/matchup.model";
import { LeagueStageModel } from "../models/league/stage.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  TeamDraft,
} from "../models/league/team.model";
import { LeagueTierListDocument } from "../models/league/tier-list.model";
import LeagueTournamentModel, {
  LeagueTournamentDocument,
} from "../models/league/tournament.model";
import { getName } from "../services/data-services/pokedex.service";
import {
  getLeagueAds,
  invalidateLeagueAdsCache,
} from "../services/league-ad/league-ad-service";
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
  updateTierList,
} from "../services/league-services/league-service";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  calculateResultScore,
  calculateTeamMatchupScoreAndWinner,
} from "../services/league-services/standings-service";
import { getPokemonTier } from "../services/league-services/tier-list-service";
import { plannerCoverage } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { s3Service } from "../services/s3.service";
import { createRoute } from "./route-builder";

type LeagueResponse = Response & {
  league?: LeagueTournamentDocument | null;
  division?: LeagueDivisionDocument | null;
  team?: LeagueTeamDocument | null;
  ruleset?: Ruleset | null;
};

// Helper functions to ensure correct loading order for route params
async function loadLeagueByKey(req: Request, res: LeagueResponse) {
  if (res.league) return;
  const league = await LeagueTournamentModel.findOne({
    tournamentKey: req.params.league_key,
  }).populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");
  if (!league) {
    throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
      tournamentKey: req.params.league_key,
    });
  }
  res.league = league;
  res.ruleset = getRuleset(league.tierList.ruleset);
}

async function loadLeagueById(req: Request, res: LeagueResponse) {
  if (res.league) return;
  const league = await LeagueTournamentModel.findById(
    req.params.league_id,
  ).populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");
  if (!league) {
    throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
      tournamentId: req.params.league_id,
    });
  }
  res.league = league;
  res.ruleset = getRuleset(league.tierList.ruleset);
}

async function loadDivision(req: Request, res: LeagueResponse) {
  if (!res.league) {
    await (req.params.league_key
      ? loadLeagueByKey(req, res)
      : loadLeagueById(req, res));
  }
  if (res.division) return;

  await res.league!.populate<{ divisions: LeagueDivisionDocument[] }>(
    "divisions",
  );

  const division_id = req.params.division_id;
  const division = (res.league!.divisions as LeagueDivisionDocument[]).find(
    (d) => d.divisionKey === division_id,
  );

  if (!division) {
    throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE, {
      divisionKey: division_id,
      tournamentKey: res.league!.tournamentKey,
    });
  }

  await division.populate<{
    teams: LeagueTeamDocument[];
  }>("teams");

  res.division = division;
}

async function loadTeam(req: Request, res: LeagueResponse) {
  if (req.params.division_id && !res.division) {
    await loadDivision(req, res);
  } else if (!req.params.division_id && !res.league) {
    await (req.params.league_key
      ? loadLeagueByKey(req, res)
      : loadLeagueById(req, res));
  }

  if (res.team) return;

  const team_id = req.params.team_id;
  const team = await LeagueTeamModel.findById(team_id);

  if (!team) {
    throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: team_id });
  }

  // This check is only possible if a division is loaded
  if (res.division && !res.division.teams.some((t) => t._id.equals(team._id))) {
    throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
      teamId: team_id,
      divisionKey: res.division.divisionKey,
    });
  }
  res.team = team;
}

export const LeagueRoutes: RouteOld = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response, next) => {
        try {
          res.json([]);
        } catch (error) {
          next(error);
        }
      },
    },

    "/:league_key/info": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          if (!res.league) {
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
          }

          // Populate divisions
          await res.league.populate<{ divisions: LeagueDivisionDocument[] }>(
            "divisions",
            ["divisionKey", "name"],
          );

          // Format division information
          const divisions = (
            res.league.divisions as LeagueDivisionDocument[]
          ).map((div) => ({
            divisionKey: div.divisionKey,
            name: div.name,
          }));

          res.json({
            name: res.league.name,
            tournamentKey: res.league.tournamentKey,
            description: res.league.description,
            format: res.league.format,
            ruleset: res.league.ruleset,
            signUpDeadline: res.league.signUpDeadline,
            draftStart: res.league.draftStart,
            draftEnd: res.league.draftEnd,
            seasonStart: res.league.seasonStart,
            seasonEnd: res.league.seasonEnd,
            logo: res.league.logo,
            divisions,
            discord: res.league.discord,
          });
        } catch (error) {
          next(error);
        }
      },
    },

    "/bracket": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          const teamData: {
            teamName: string;
            coach: string;
            logo: string;
            seed: number;
          }[] = [
            {
              teamName: `Philadelphia Flygons`,
              coach: "02ThatOneGuy",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565385237-Philadelphia_Flygons.png",
              seed: 1,
            },
            {
              teamName: `Mighty Murkrow`,
              coach: "hsoj",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097094680-Mighty Murkrow.png",
              seed: 5,
            },
            {
              teamName: `Fitchburg's Sun Chasers`,
              coach: "Feather",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565484354-Fitchburgs_Sun_Chaser.png",
              seed: 2,
            },
            {
              teamName: `Chicago White Fox`,
              coach: "TheNotoriousABS",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565596549-Chicago_Ninetales.png",
              seed: 8,
            },
            {
              teamName: `Deimos Deoxys`,
              coach: "Lumaris",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1744422916695-DeimosDeoxys.png",
              seed: 3,
            },
            {
              teamName: `Alpine Arcanines`,
              coach: "Lion",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565450693-AlpineArcanines.png",
              seed: 4,
            },
            {
              teamName: `Victorious Vigoroths`,
              coach: "Speedy",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097393478-Victorious_Vigoroths.png",
              seed: 7,
            },
            {
              teamName: `Deep Sea Duskulls`,
              coach: "Emeglebon",
              logo: "",
              seed: 9,
            },
            {
              teamName: `Twinleaf Tatsugiri`,
              coach: "Penic",
              logo: "",
              seed: 10,
            },
            {
              teamName: `I like 'em THICC`,
              coach: "Kat",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565503663-I_like_em_THICC.png",
              seed: 6,
            },
            {
              teamName: `London Vespiquens`,
              coach: "Jake W",
              logo: "",
              seed: 11,
            },
            {
              teamName: `Tampa T-Chainz`,
              coach: "Spite",
              logo: "",
              seed: 12,
            },
            {
              teamName: `Kalos Quagsires`,
              coach: "Caltech_",
              logo: "",
              seed: 13,
            },
            {
              teamName: `Montreal Mean Mareanies`,
              coach: "Qofol",
              logo: "",
              seed: 14,
            },
            {
              teamName: `Chicago Sky Attack`,
              coach: "Quincy",
              logo: "",
              seed: 15,
            },
            {
              teamName: `Midnight Teddy's`,
              coach: "neb5",
              logo: "",
              seed: 16,
            },
            {
              teamName: `Moochelin Star Chefs`,
              coach: "Rai",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565579136-Moochelin_Star_Chefs.png",
              seed: 17,
            },
            {
              teamName: `Kalamazoo Komalas`,
              coach: "SuperSpiderPig",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565551389-Kalamazoo_Komalas.png",
              seed: 18,
            },
            {
              teamName: `Jokic Lokix`,
              coach: "Dotexe",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565520216-Jokic_Lokix.png",
              seed: 19,
            },
            {
              teamName: `Jimothy Jirachi Tomfoolery`,
              coach: "Jimothy J",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565565925-Jimothy_Jirachi.png",
              seed: 20,
            },
            {
              teamName: `Memphis Bloodmoons`,
              coach: "Steven",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565465031-Memphis_Bloodmoons.png",
              seed: 21,
            },
            {
              teamName: `F.C. Monterayquaza`,
              coach: "ChristianDeputy",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565535075-F.C._Monterrayquaza.png",
              seed: 22,
            },
            {
              teamName: `Chicago White Sawks`,
              coach: "BR@D",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565766076-Chicago_White_SawksBrad.png",
              seed: 23,
            },
            {
              teamName: `Bug Brigade`,
              coach: "TheNPC420",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565423936-Bug_Brigade.png",
              seed: 24,
            },
            {
              teamName: `Minnesota Lycanrocs`,
              coach: "SpiralBB",
              logo: "",
              seed: 25,
            },
            {
              teamName: `Seattle Supersonics`,
              coach: "AwesomenessGuy",
              logo: "",
              seed: 26,
            },
            {
              teamName: `Fairview Floatzels`,
              coach: "Lupa",
              logo: "",
              seed: 27,
            },
            {
              teamName: `McTesuda's`,
              coach: "Lewis",
              logo: "",
              seed: 28,
            },
            {
              teamName: `Pacifidlog Pichus`,
              coach: "13Luken",
              logo: "",
              seed: 29,
            },
            {
              teamName: `Mossdeep City Sharpedos`,
              coach: "Travis",
              logo: "",
              seed: 30,
            },
            {
              teamName: `Texas Thousand`,
              coach: "CheesyBP",
              logo: "",
              seed: 31,
            },
            {
              teamName: `Kommo-o Kommanders`,
              coach: "AnimaSean",
              logo: "",
              seed: 32,
            },
          ];

          const normalized24 = {
            format: "single-elim",
            teams: teamData
              .map((t) => ({
                teamName: t.teamName,
                coachName: t.coach,
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
          next(error);
        }
      },
    },
    "/ad-list": {
      get: async function (req: Request, res: Response, next) {
        try {
          const leagueAds = await getLeagueAds();
          res.json(leagueAds);
        } catch (error) {
          next(error);
        }
      },
    },
    "/ad-list/manage": {
      get: async function (req: Request, res: Response, next) {
        try {
          const owner = req.auth?.payload.sub;
          if (!owner) {
            throw new PDZError(ErrorCodes.AUTH.UNAUTHORIZED);
          }

          const documents = await LeagueAdModel.find({ owner }).sort({
            createdAt: -1,
          });

          const leagueAds = documents.map((doc) => LeagueAd.fromDocument(doc));
          res.json(leagueAds);
        } catch (error) {
          next(error);
        }
      },
      post: async function (req: Request, res: Response, next) {
        try {
          const owner = req.auth?.payload.sub;
          if (!owner) {
            throw new PDZError(ErrorCodes.AUTH.UNAUTHORIZED);
          }

          const leagueAd = LeagueAd.fromForm(req.body, owner);

          if (!leagueAd.isValid()) {
            throw new PDZError(ErrorCodes.LEAGUE_AD.INVALID_AD_DATA);
          }

          const document = await leagueAd.toDocument();
          await document.save();

          invalidateLeagueAdsCache();
          logger.info(`New league ad created: ${document._id}`);
          res.status(201).json({ _id: document._id, status: document.status });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck],
    },
    "/ad-list/manage/:ad_id": {
      delete: async function (req: Request, res: Response, next) {
        try {
          const owner = req.auth?.payload.sub;
          if (!owner) {
            throw new PDZError(ErrorCodes.AUTH.UNAUTHORIZED);
          }

          const ad = await LeagueAdModel.findById(req.params.ad_id);

          if (!ad) {
            throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND);
          }

          if (ad.owner !== owner) {
            throw new PDZError(ErrorCodes.LEAGUE_AD.UNAUTHORIZED_ACCESS);
          }

          await LeagueAdModel.findByIdAndDelete(req.params.ad_id);
          invalidateLeagueAdsCache();
          logger.info(`League ad deleted: ${req.params.ad_id}`);
          res.status(200).json({ message: "Ad deleted successfully" });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/roles": {
      get: async function (req: Request, res: Response, next) {
        try {
          res.json(getRoles(req.auth?.payload.sub));
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/rules": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          res.json(res.league!.rules);
        } catch (error) {
          next(error);
        }
      },
    },

    "/:league_key/tier-list": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          const { division } = req.query;
          const tierList = await getTierList(res.league!);
          const divisions = await getDrafted(
            res.league!,
            division as string | string[],
          );
          res.json({ tierList, divisions });
        } catch (error) {
          next(error);
        }
      },
    },
    "/:league_key/tier-list/edit": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          const { division } = req.query;
          const tierList = await getTierList(res.league!, true);
          const divisions = await getDrafted(
            res.league!,
            division as string | string[],
          );
          res.json({ tierList, divisions });
        } catch (error) {
          next(error);
        }
      },
      post: async function (req: Request, res: LeagueResponse, next) {
        try {
          if (!res.league) {
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
          }

          // Extract tiers from request body
          const { tiers } = req.body;
          if (!tiers || !Array.isArray(tiers)) {
            throw new PDZError(ErrorCodes.TIER_LIST.INVALID_DATA, {
              field: "tiers",
              expected: "array",
              received: typeof tiers,
            });
          }

          // Update the tier list
          await updateTierList(res.league, tiers);

          logger.info(
            `Tier list updated for league ${res.league.tournamentKey} by ${req.auth?.payload.sub}`,
          );

          res.json({
            success: true,
            message: "Tier list updated successfully",
          });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/schedule": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          if (!res.league) {
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
          }

          // Fetch all stages for this league
          const stages = await LeagueStageModel.find({
            tournamentId: res.league._id,
          });

          // For each stage, fetch its matchups
          const stagesWithMatchups = await Promise.all(
            stages.map(async (stage) => {
              const matchups = await LeagueMatchupModel.find({
                stageId: stage._id,
              }).populate([
                {
                  path: "team1Id",
                  select: "logo coach",
                  populate: {
                    path: "coach",
                    select: "teamName",
                  },
                },
                {
                  path: "team2Id",
                  select: "logo coach",
                  populate: {
                    path: "coach",
                    select: "teamName",
                  },
                },
              ]);

              // Transform matchups to match League.Matchup interface
              const transformedMatchups = matchups.map((matchup) => {
                const team1Doc = matchup.team1Id as any;
                const team2Doc = matchup.team2Id as any;
                const { team1Score, team2Score, winner } =
                  calculateTeamMatchupScoreAndWinner(matchup);

                return {
                  team1: {
                    teamName: team1Doc?.coach?.teamName || "Unknown Team",
                    coach: team1Doc?.coach?.teamName || "Unknown Coach",
                    score: team1Score,
                    logo: team1Doc?.logo || "",
                    winner:
                      winner === "team1"
                        ? true
                        : winner === "team2"
                          ? false
                          : undefined,
                  },
                  team2: {
                    teamName: team2Doc?.coach?.teamName || "Unknown Team",
                    coach: team2Doc?.coach?.teamName || "Unknown Coach",
                    score: team2Score,
                    logo: team2Doc?.logo || "",
                    winner:
                      winner === "team2"
                        ? true
                        : winner === "team1"
                          ? false
                          : undefined,
                  },
                  matches: matchup.results.map((result) => ({
                    link: result.replay || "",
                    team1: {
                      team: result.team1.pokemon.map((pokemon) => ({
                        id: pokemon.id,
                        name: pokemon.name,
                        status: pokemon.stats?.deaths
                          ? "fainted"
                          : pokemon.stats?.brought
                            ? "brought"
                            : undefined,
                      })),
                      score: calculateResultScore(result.team1),
                      winner: result.winner === "team1",
                    },
                    team2: {
                      team: result.team2.pokemon.map((pokemon) => ({
                        id: pokemon.id,
                        name: pokemon.name,
                        status: pokemon.stats?.deaths
                          ? "fainted"
                          : pokemon.stats?.brought
                            ? "brought"
                            : undefined,
                      })),
                      score: calculateResultScore(result.team2),
                      winner: result.winner === "team2",
                    },
                  })),
                };
              });

              return {
                _id: stage._id,
                name: stage.name,
                matchups: transformedMatchups,
              };
            }),
          );

          res.json(stagesWithMatchups);
        } catch (error) {
          next(error);
        }
      },
    },
    "/:league_key/teams/:team_id": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          const team = await LeagueTeamModel.findById(req.params["team_id"]!);
          if (!team) {
            throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
              teamId: req.params["team_id"],
            });
          }

          await res.league!.populate<{
            tierList: LeagueTierListDocument;
          }>("tierList");

          const draft = await Promise.all(
            team.draft.map(async (draftItem) => {
              const tier = await getPokemonTier(
                res.league!,
                draftItem.pokemon.id,
              );
              const pokemonName = getName(draftItem.pokemon.id);
              return {
                id: draftItem.pokemon.id,
                name: pokemonName,
                tier,
              };
            }),
          );

          // Get pokemon standings for this team
          const teamMatchups = await LeagueMatchupModel.find({
            $or: [{ team1Id: team._id }, { team2Id: team._id }],
          }).populate([
            {
              path: "team1Id",
              select: "coach",
              populate: "coach",
            },
            {
              path: "team2Id",
              select: "coach",
              populate: "coach",
            },
          ]);

          // Filter to only include pokemon for this team
          const pokemonStandings = await calculateDivisionPokemonStandings(
            teamMatchups,
            team._id.toString(),
          );

          const coach = team.coach as LeagueCoachDocument;

          res.json({
            name: coach.teamName,
            timezone: coach.timezone,
            logo: coach.logo,
            draft,
            pokemonStandings,
          });
        } catch (error) {
          next(error);
        }
      },
    },

    "/:league_key/divisions/:division_id/picks": {
      middleware: [jwtCheck],
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          if (!res.league) {
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
          }

          if (!res.division) {
            throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE);
          }

          const division = await LeagueDivisionModel.findById(
            res.division._id,
          ).populate<{
            teams: (LeagueTeamDocument & {
              picks: Types.DocumentArray<
                TeamDraft & { picker: LeagueCoachDocument }
              >;
              coach: LeagueCoachDocument;
            })[];
          }>({
            path: "teams",
            populate: ["draft.picker", "coach"],
          });

          if (!division) {
            throw new PDZError(ErrorCodes.DIVISION.NOT_FOUND);
          }

          const allPicks = await Promise.all(
            division.teams.map(async (team) => {
              const picks = await Promise.all(
                team.draft.map(async (draftItem) => ({
                  pokemon: {
                    id: draftItem.pokemon.id,
                    name: getName(draftItem.pokemon.id),
                    tier: await getPokemonTier(
                      res.league!,
                      draftItem.pokemon.id,
                    ),
                  },
                  timestamp: draftItem.timestamp,
                  picker: (draftItem.picker as LeagueCoach)?.auth0Id,
                })),
              );

              const coach = team.coach as LeagueCoachDocument;
              return {
                name: coach.teamName,
                picks: picks,
                id: team._id.toString(),
              };
            }),
          );

          res.json(allPicks);
        } catch (error) {
          next(error);
        }
      },
    },
    "/:league_key/divisions/:division_id": {
      middleware: [jwtCheck],
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          res.json(
            await getDivisionDetails(
              res.league!,
              res.division!,
              req.auth!.payload.sub!,
            ),
          );
        } catch (error) {
          console.log(error);
          next(error);
        }
      },
    },
    "/:league_key/divisions/:division_id/schedule": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          const stages = await LeagueStageModel.find({
            divisionIds: res.division!._id,
          });

          const stagesWithMatchups = await Promise.all(
            stages.map(async (stage) => {
              const matchups = await LeagueMatchupModel.find({
                stageId: stage._id,
              }).populate([
                {
                  path: "team1Id",
                  select: "logo coach",
                  populate: {
                    path: "coach",
                    select: "name teamName",
                  },
                },
                {
                  path: "team2Id",
                  select: "logo coach",
                  populate: {
                    path: "coach",
                    select: "name teamName",
                  },
                },
              ]);

              // Transform matchups to match League.Matchup interface
              const transformedMatchups = matchups.map((matchup) => {
                const team1Doc = matchup.team1Id as any;
                const team2Doc = matchup.team2Id as any;
                const { team1Score, team2Score, winner } =
                  calculateTeamMatchupScoreAndWinner(matchup);

                return {
                  team1: {
                    teamName: team1Doc?.coach?.teamName || "Unknown Team",
                    coach: team1Doc?.coach?.name || "Unknown Coach",
                    score: team1Score,
                    logo: team1Doc?.logo || "",
                    winner:
                      winner === "team1"
                        ? true
                        : winner === "team2"
                          ? false
                          : undefined,
                  },
                  team2: {
                    teamName: team2Doc?.coach?.teamName || "Unknown Team",
                    coach: team2Doc?.coach?.name || "Unknown Coach",
                    score: team2Score,
                    logo: team2Doc?.logo || "",
                    winner:
                      winner === "team2"
                        ? true
                        : winner === "team1"
                          ? false
                          : undefined,
                  },
                  matches: matchup.results.map((result) => ({
                    link: result.replay || "",
                    team1: {
                      team: result.team1.pokemon.map((pokemon) => ({
                        id: pokemon.id,
                        name: pokemon.name,
                        status: pokemon.stats?.deaths
                          ? "fainted"
                          : pokemon.stats?.brought
                            ? "brought"
                            : undefined,
                      })),
                      score: calculateResultScore(result.team1),
                      winner: result.winner === "team1",
                    },
                    team2: {
                      team: result.team2.pokemon.map((pokemon) => ({
                        id: pokemon.id,
                        name: pokemon.name,
                        status: pokemon.stats?.deaths
                          ? "fainted"
                          : pokemon.stats?.brought
                            ? "brought"
                            : undefined,
                      })),
                      score: calculateResultScore(result.team2),
                      winner: result.winner === "team2",
                    },
                  })),
                };
              });

              return {
                _id: stage._id,
                name: stage.name,
                matchups: transformedMatchups,
              };
            }),
          );

          res.json(stagesWithMatchups);
        } catch (error) {
          next(error);
        }
      },
    },
    "/:league_key/divisions/:division_id/standings": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          const stages = await LeagueStageModel.find({
            divisionIds: res.division!._id,
          });

          const allMatchups = await LeagueMatchupModel.find({
            stageId: { $in: stages.map((s) => s._id) },
          }).populate([
            {
              path: "team1Id",
              select: "logo coach",
              populate: { path: "coach", select: "teamName" },
            },
            {
              path: "team2Id",
              select: "logo coach",
              populate: { path: "coach", select: "teamName" },
            },
          ]);

          const divisionTeams = await LeagueTeamModel.find({
            _id: { $in: res.division!.teams },
          }).populate({ path: "coach", select: "teamName" });

          const coachStandings = await calculateDivisionCoachStandings(
            allMatchups,
            stages,
            divisionTeams,
          );

          const pokemonStandings =
            await calculateDivisionPokemonStandings(allMatchups);

          res.json({
            coachStandings: {
              //TODO: make dynamic
              cutoff: 8,
              weeks: stages.length,
              teams: coachStandings,
            },
            pokemonStandings,
          });
        } catch (error) {
          next(error);
        }
      },
    },
    "/:league_key/divisions/:division_id/order": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          if (!res.league) {
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
          }

          if (!res.division) {
            throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE);
          }

          const division = await LeagueDivisionModel.findById(
            res.division._id,
          ).populate<{ teams: LeagueTeamDocument[] }>("teams");

          if (!division) {
            throw new PDZError(ErrorCodes.DIVISION.NOT_FOUND);
          }

          const draftStyle = division.draftStyle;
          const numberOfRounds = (res.league.tierList as LeagueTierListDocument)
            .draftCount.max;
          const divisionFull = await LeagueDivisionModel.findById(
            res.division._id,
          ).populate<{
            teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
          }>({
            path: "teams",
            populate: "coach",
          });
          const initialTeamOrder = divisionFull!.teams;

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
              const coach = team.coach as LeagueCoachDocument;
              const draftPick: DraftPick = { teamName: coach.teamName };
              if (team.draft[round]) {
                const pokemonId = team.draft[round].pokemon.id;
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
                  now.getTime() + thirtyMinutes + randomOffsetMilliseconds,
                );
              }
              currentRound.push(draftPick);
            }
            draftRounds.push(currentRound);
          }

          res.json(draftRounds);
        } catch (error) {
          next(error);
        }
      },
    },
    "/:league_key/divisions/:division_id/power-rankings": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          const tierList = res.league!.tierList as LeagueTierListDocument;
          const ruleset = getRuleset(tierList.ruleset);
          const teams = await Promise.all(
            (
              res.division!.teams as (LeagueTeamDocument & {
                coach: LeagueCoachDocument;
              })[]
            ).map(async (team, index) => {
              const teamRaw = team.draft.map((pick) => ({
                id: pick.pokemon.id,
                capt: pick.capt,
              }));

              const draft = DraftSpecie.getTeam(teamRaw, ruleset);

              const typechart = new Typechart(draft);
              const summary = new SummaryClass(draft);
              const coach = team.coach as LeagueCoachDocument;
              return {
                info: {
                  name: coach.teamName,
                  index,
                  id: team._id.toString(),
                },
                typechart: typechart.toJson(),
                recommended: typechart.recommended(),
                summary: summary.toJson(),
                movechart: await movechart(draft, ruleset),
                coverage: await plannerCoverage(draft),
              };
            }),
          );
          return res.json(teams);
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/divisions/:division_id/teams/:team_id/draft": {
      post: async function (req: Request, res: LeagueResponse, next) {
        try {
          const { pokemonId } = req.body;
          if (!pokemonId) {
            throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
              field: "pokemonId",
            });
          }

          if (!(await isCoach(res.team!, req.auth!.payload.sub!))) {
            throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
              reason: "User is not a coach on this team",
            });
          }

          await draftPokemon(res.league!, res.division!, res.team!, pokemonId);

          return res.status(200).json({ message: "Drafted successfully." });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/divisions/:division_id/teams/:team_id/picks": {
      post: async function (req: Request, res: LeagueResponse, next) {
        try {
          res.team!.picks = req.body.picks;
          await res.team!.save();
          return res
            .status(200)
            .json({ message: "Draft pick set successfully." });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_key/manage/divisions/:division_id/state": {
      post: async function (req: Request, res: LeagueResponse, next) {
        try {
          const { state } = req.body;
          setDivsionState(res.league!, res.division!, state);
          return res.status(200).json({ message: "Timer set successfully." });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck, rolecheck("organizer")],
    },
    "/:league_key/manage/divisions/:division_id/skip": {
      post: async function (req: Request, res: LeagueResponse, next) {
        try {
          await skipCurrentPick(res.league!, res.division!);
          return res.status(200).json({ message: "Skip successful." });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck, rolecheck("organizer")],
    },
    "/:league_key/manage/divisions/:division_id/setdraft": {
      post: async function (req: Request, res: LeagueResponse, next) {
        try {
          const { pokemonId, teamId } = req.body;

          if (!pokemonId || !teamId) {
            throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
              required: ["pokemonId", "teamId"],
              received: { pokemonId, teamId },
            });
          }

          const team = res.division!.teams.find((team) =>
            team._id.equals(teamId),
          ) as LeagueTeamDocument | undefined;
          if (!team) {
            throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, { teamId });
          }
          await draftPokemon(res.league!, res.division!, team, pokemonId);

          return res
            .status(200)
            .json({ message: "Draft pick set successfully." });
        } catch (error) {
          next(error);
        }
      },
      middleware: [jwtCheck, rolecheck("organizer")],
    },
    "/:league_key/signup": {
      get: async function (req: Request, res: LeagueResponse, next) {
        try {
          if (!res.league) {
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
          }

          const users = await LeagueCoachModel.find({
            tournamentId: res.league._id,
          });

          // await res.league!.populate<{
          //   divisions: LeagueDivisionDocument[];
          // }>("divisions");

          const coachesWithLogos = users.map((user) => {
            const division = undefined;

            return {
              name: user.discordName,
              timezone: user.timezone,
              experience: user.experience,
              dropped: user.droppedBefore ? user.droppedWhy : undefined,
              status: user.status,
              teamName: user.teamName,
              signedUpAt: user.signedUpAt,
              logo: user.logo ? s3Service.getPublicUrl(user.logo) : undefined,
              division,
            };
          });

          res.json(coachesWithLogos);
        } catch (error) {
          next(error);
        }
      },
      post: async (req: Request, res: LeagueResponse, next) => {
        try {
          if (!res.league) {
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
          }

          const auth0Id = req.auth!.payload.sub!;
          const signup = BattleZone.validateSignUpForm(req.body, auth0Id);

          let leagueUser = await LeagueCoachModel.findOne({
            auth0Id,
            tournamentId: res.league._id,
          });

          if (leagueUser) {
            throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
              tournamentId: res.league._id.toString(),
            });
          }

          leagueUser = new LeagueCoachModel({
            auth0Id,
            discordName: signup.name,
            timezone: signup.timezone,
            tournamentId: res.league._id,
            teamName: signup.teamName,
            experience: signup.experience,
            droppedBefore: signup.droppedBefore,
            droppedWhy: signup.droppedWhy,
            confirmed: signup.confirm,
            status: "pending",
            signedUpAt: new Date(),
          });
          await leagueUser.save();

          // if (
          //   !res.league.coaches.some((c: any) => c._id?.equals(leagueUser!._id))
          // ) {
          //   res.league.coaches.push(leagueUser._id);
          //   await res.league.save();
          // }

          if (client) {
            try {
              const guild = await client.guilds.fetch("1183936734719922176");
              if (guild) {
                const channel = guild.channels.cache.get(
                  "1303896194187132978",
                ) as TextChannel;
                if (channel && channel.isTextBased()) {
                  await res.league.populate<{ coaches: LeagueCoachDocument[] }>(
                    "coaches",
                  );
                  const totalCoaches = res.league.coaches.length;
                  channel.send(
                    `${signup.name} signed up for **${res.league.name}**. Total coaches: ${totalCoaches}.`,
                  );
                }
              }
            } catch (discordError) {
              logger.warn("Failed to send Discord notification:", discordError);
            }
          }

          return res.status(201).json({
            message: "Sign up successful.",
            userId: leagueUser._id.toString(),
            tournamentId: res.league._id.toString(),
          });
        } catch (error) {
          next(error);
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
      league_id,
    ) {
      try {
        await loadLeagueById(req, res);
        next();
      } catch (error) {
        next(error);
      }
    },
    league_key: async function (
      req: Request,
      res: LeagueResponse,
      next,
      league_key,
    ) {
      try {
        await loadLeagueByKey(req, res);
        next();
      } catch (error) {
        next(error);
      }
    },
    division_id: async function (
      req: Request,
      res: LeagueResponse,
      next,
      division_id,
    ) {
      try {
        await loadDivision(req, res);
        next();
      } catch (error) {
        next(error);
      }
    },
    team_id: async function (req: Request, res: LeagueResponse, next, team_id) {
      try {
        await loadTeam(req, res);
        next();
      } catch (error) {
        next(error);
      }
    },
  },
};

const DivisionHandler = async (
  ctx: { tournament: LeagueTournamentDocument },
  division_id: string,
) => {
  await ctx.tournament.populate<{ divisions: LeagueDivisionDocument[] }>(
    "divisions",
  );
  const division = (ctx.tournament.divisions as LeagueDivisionDocument[]).find(
    (d) => d.divisionKey === division_id,
  );
  if (!division)
    throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE, {
      divisionKey: division_id,
      tournamentKey: ctx.tournament.tournamentKey,
    });

  await division.populate<{
    teams: LeagueTeamDocument[];
  }>("teams");

  return { division };
};
export const LeagueRoute = createRoute()((r) => {
  r.get((ctx) => {
    return [];
  });
  r.path("bracket")((r) => {
    r.get(async (ctx) => {
      const teamData: {
        teamName: string;
        coach: string;
        logo: string;
        seed: number;
      }[] = [
        {
          teamName: `Philadelphia Flygons`,
          coach: "02ThatOneGuy",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565385237-Philadelphia_Flygons.png",
          seed: 1,
        },
        {
          teamName: `Mighty Murkrow`,
          coach: "hsoj",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097094680-Mighty Murkrow.png",
          seed: 5,
        },
        {
          teamName: `Fitchburg's Sun Chasers`,
          coach: "Feather",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565484354-Fitchburgs_Sun_Chaser.png",
          seed: 2,
        },
        {
          teamName: `Chicago White Fox`,
          coach: "TheNotoriousABS",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565596549-Chicago_Ninetales.png",
          seed: 8,
        },
        {
          teamName: `Deimos Deoxys`,
          coach: "Lumaris",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1744422916695-DeimosDeoxys.png",
          seed: 3,
        },
        {
          teamName: `Alpine Arcanines`,
          coach: "Lion",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565450693-AlpineArcanines.png",
          seed: 4,
        },
        {
          teamName: `Victorious Vigoroths`,
          coach: "Speedy",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097393478-Victorious_Vigoroths.png",
          seed: 7,
        },
        {
          teamName: `Deep Sea Duskulls`,
          coach: "Emeglebon",
          logo: "",
          seed: 9,
        },
        {
          teamName: `Twinleaf Tatsugiri`,
          coach: "Penic",
          logo: "",
          seed: 10,
        },
        {
          teamName: `I like 'em THICC`,
          coach: "Kat",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565503663-I_like_em_THICC.png",
          seed: 6,
        },
        {
          teamName: `London Vespiquens`,
          coach: "Jake W",
          logo: "",
          seed: 11,
        },
        {
          teamName: `Tampa T-Chainz`,
          coach: "Spite",
          logo: "",
          seed: 12,
        },
        {
          teamName: `Kalos Quagsires`,
          coach: "Caltech_",
          logo: "",
          seed: 13,
        },
        {
          teamName: `Montreal Mean Mareanies`,
          coach: "Qofol",
          logo: "",
          seed: 14,
        },
        {
          teamName: `Chicago Sky Attack`,
          coach: "Quincy",
          logo: "",
          seed: 15,
        },
        {
          teamName: `Midnight Teddy's`,
          coach: "neb5",
          logo: "",
          seed: 16,
        },
        {
          teamName: `Moochelin Star Chefs`,
          coach: "Rai",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565579136-Moochelin_Star_Chefs.png",
          seed: 17,
        },
        {
          teamName: `Kalamazoo Komalas`,
          coach: "SuperSpiderPig",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565551389-Kalamazoo_Komalas.png",
          seed: 18,
        },
        {
          teamName: `Jokic Lokix`,
          coach: "Dotexe",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565520216-Jokic_Lokix.png",
          seed: 19,
        },
        {
          teamName: `Jimothy Jirachi Tomfoolery`,
          coach: "Jimothy J",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565565925-Jimothy_Jirachi.png",
          seed: 20,
        },
        {
          teamName: `Memphis Bloodmoons`,
          coach: "Steven",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565465031-Memphis_Bloodmoons.png",
          seed: 21,
        },
        {
          teamName: `F.C. Monterayquaza`,
          coach: "ChristianDeputy",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565535075-F.C._Monterrayquaza.png",
          seed: 22,
        },
        {
          teamName: `Chicago White Sawks`,
          coach: "BR@D",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565766076-Chicago_White_SawksBrad.png",
          seed: 23,
        },
        {
          teamName: `Bug Brigade`,
          coach: "TheNPC420",
          logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565423936-Bug_Brigade.png",
          seed: 24,
        },
        {
          teamName: `Minnesota Lycanrocs`,
          coach: "SpiralBB",
          logo: "",
          seed: 25,
        },
        {
          teamName: `Seattle Supersonics`,
          coach: "AwesomenessGuy",
          logo: "",
          seed: 26,
        },
        {
          teamName: `Fairview Floatzels`,
          coach: "Lupa",
          logo: "",
          seed: 27,
        },
        {
          teamName: `McTesuda's`,
          coach: "Lewis",
          logo: "",
          seed: 28,
        },
        {
          teamName: `Pacifidlog Pichus`,
          coach: "13Luken",
          logo: "",
          seed: 29,
        },
        {
          teamName: `Mossdeep City Sharpedos`,
          coach: "Travis",
          logo: "",
          seed: 30,
        },
        {
          teamName: `Texas Thousand`,
          coach: "CheesyBP",
          logo: "",
          seed: 31,
        },
        {
          teamName: `Kommo-o Kommanders`,
          coach: "AnimaSean",
          logo: "",
          seed: 32,
        },
      ];

      const normalized24 = {
        format: "single-elim",
        teams: teamData
          .map((t) => ({
            teamName: t.teamName,
            coachName: t.coach,
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

      return normalized24;
    });
  });
  r.path("ad-list")((r) => {
    r.get(async (ctx) => {
      const leagueAds = await getLeagueAds();
      return leagueAds;
    });
    r.path("manage").auth()((r) => {
      r.get(async (ctx) => {
        const documents = await LeagueAdModel.find({ owner: ctx.sub }).sort({
          createdAt: -1,
        });
        const leagueAds = documents.map((doc) => LeagueAd.fromDocument(doc));
        return leagueAds;
      });
      r.post.validate({
        //TODO: Define proper schema
        body: (data) => z.object({}).parse(data),
      })(async (ctx, req, res) => {
        const leagueAd = LeagueAd.fromForm(ctx.validatedBody, ctx.sub);
        if (!leagueAd.isValid())
          throw new PDZError(ErrorCodes.LEAGUE_AD.INVALID_AD_DATA);
        const document = await leagueAd.toDocument();
        await document.save();
        invalidateLeagueAdsCache();
        logger.info(`New league ad created: ${document._id}`);
        res.status(201).json({ _id: document._id, status: document.status });
      });
      r.param("ad_id", (ctx, ad_id) => ({ ad_id }))((r) => {
        r.delete(async (ctx, req, res) => {
          const ad = await LeagueAdModel.findById(ctx.ad_id);
          if (!ad) throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND);
          if (ad.owner !== ctx.sub)
            throw new PDZError(ErrorCodes.LEAGUE_AD.UNAUTHORIZED_ACCESS);
          await LeagueAdModel.findByIdAndDelete(ctx.ad_id);
          invalidateLeagueAdsCache();
          logger.info(`League ad deleted: ${ctx.ad_id}`);
          res.status(200).json({ message: "Ad deleted successfully" });
        });
      });
    });
  });
  r.param("tournament_key", async (ctx, tournament_key) => {
    const tournament = await LeagueTournamentModel.findOne({
      tournamentKey: tournament_key,
    }).populate<{
      tierList: LeagueTierListDocument;
    }>("tierList");
    if (!tournament)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        tournamentKey: tournament_key,
      });
    const ruleset = getRuleset(tournament.tierList.ruleset);
    return { tournament, ruleset };
  })((r) => {
    r.path("info")((r) => {
      r.get(async (ctx) => {
        await ctx.tournament.populate<{ divisions: LeagueDivisionDocument[] }>(
          "divisions",
          ["divisionKey", "name"],
        );

        const divisions = (
          ctx.tournament.divisions as LeagueDivisionDocument[]
        ).map((div) => ({
          divisionKey: div.divisionKey,
          name: div.name,
        }));

        return {
          name: ctx.tournament.name,
          tournamentKey: ctx.tournament.tournamentKey,
          description: ctx.tournament.description,
          format: ctx.tournament.format,
          ruleset: ctx.tournament.ruleset,
          signUpDeadline: ctx.tournament.signUpDeadline,
          draftStart: ctx.tournament.draftStart,
          draftEnd: ctx.tournament.draftEnd,
          seasonStart: ctx.tournament.seasonStart,
          seasonEnd: ctx.tournament.seasonEnd,
          logo: ctx.tournament.logo,
          divisions,
          discord: ctx.tournament.discord,
        };
      });
    });
    r.path("roles").auth()((r) => {
      r.get(async (ctx) => {
        return getRoles(ctx.sub);
      });
    });
    r.path("signup")((r) => {
      r.get(async (ctx) => {
        const users = await LeagueCoachModel.find({
          tournamentId: ctx.tournament._id,
        });
        const coachesWithLogos = users.map((user) => {
          const division = undefined;
          return {
            name: user.discordName,
            timezone: user.timezone,
            experience: user.experience,
            dropped: user.droppedBefore ? user.droppedWhy : undefined,
            status: user.status,
            teamName: user.teamName,
            signedUpAt: user.signedUpAt,
            logo: user.logo ? s3Service.getPublicUrl(user.logo) : undefined,
            division,
          };
        });
        return coachesWithLogos;
      });
      r.post.auth().validate({
        //TODO: Define proper schema
        body: (data) => z.object({}).parse(data),
      })(async (ctx, req, res) => {
        const signup = BattleZone.validateSignUpForm(
          ctx.validatedBody,
          ctx.sub,
        );

        let leagueUser = await LeagueCoachModel.findOne({
          auth0Id: ctx.sub,
          tournamentId: ctx.tournament._id,
        });

        if (leagueUser)
          throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
            tournamentId: ctx.tournament._id.toString(),
          });

        leagueUser = new LeagueCoachModel({
          auth0Id: ctx.sub,
          discordName: signup.name,
          timezone: signup.timezone,
          tournamentId: ctx.tournament._id,
          teamName: signup.teamName,
          experience: signup.experience,
          droppedBefore: signup.droppedBefore,
          droppedWhy: signup.droppedWhy,
          confirmed: signup.confirm,
          status: "pending",
          signedUpAt: new Date(),
        });
        await leagueUser.save();
        if (client) {
          try {
            const guild = await client.guilds.fetch("1183936734719922176");
            if (guild) {
              const channel = guild.channels.cache.get(
                "1303896194187132978",
              ) as TextChannel;
              if (channel && channel.isTextBased()) {
                await ctx.tournament.populate<{
                  coaches: LeagueCoachDocument[];
                }>("coaches");
                const totalCoaches = ctx.tournament.coaches.length;
                channel.send(
                  `${signup.name} signed up for **${ctx.tournament.name}**. Total coaches: ${totalCoaches}.`,
                );
              }
            }
          } catch (discordError) {
            logger.warn("Failed to send Discord notification:", discordError);
          }
        }

        return res.status(201).json({
          message: "Sign up successful.",
          userId: leagueUser._id.toString(),
          tournamentId: ctx.tournament._id.toString(),
        });
      });
    });
    r.path("rules")((r) => {
      r.get(async (ctx) => {
        return ctx.tournament.rules;
      });
    });
    r.path("tier-list")((r) => {
      r.get.validate({
        query: (data) =>
          z
            .object({
              division: z.union([
                z.string().min(1),
                z.array(z.string().min(1)),
              ]),
            })
            .parse(data),
      })(async (ctx) => {
        const { division } = ctx.validatedQuery;
        const tierList = await getTierList(ctx.tournament);
        const divisions = await getDrafted(ctx.tournament, division);
        return { tierList, divisions };
      });
      r.path("edit").auth()((r) => {
        r.get.validate({
          query: (data) =>
            z
              .object({
                division: z.union([
                  z.string().min(1),
                  z.array(z.string().min(1)),
                ]),
              })
              .parse(data),
        })(async (ctx) => {
          const { division } = ctx.validatedQuery;
          const tierList = await getTierList(ctx.tournament, true);
          const divisions = await getDrafted(ctx.tournament, division);
          return { tierList, divisions };
        });
        r.post.validate({
          body: (data) =>
            z
              .object({
                tiers: z.array(
                  z.object({
                    name: z.string(),
                    pokemon: z.array(
                      z.object({
                        id: z.string(),
                        name: z.string(),
                      }),
                    ),
                  }),
                ),
              })
              .parse(data),
        })(async (ctx) => {
          const { tiers } = ctx.validatedBody;
          await updateTierList(ctx.tournament, tiers);
          logger.info(
            `Tier list updated for league ${ctx.tournament.tournamentKey} by ${ctx.sub}`,
          );
          return {
            success: true,
            message: "Tier list updated successfully",
          };
        });
      });
    });
    r.path("schedule")((r) => {
      r.get(async (ctx) => {
        const stages = await LeagueStageModel.find({
          tournamentId: ctx.tournament._id,
        });
        const stagesWithMatchups = await Promise.all(
          stages.map(async (stage) => {
            const matchups = await LeagueMatchupModel.find({
              stageId: stage._id,
            }).populate([
              {
                path: "team1Id",
                select: "logo coach",
                populate: {
                  path: "coach",
                  select: "teamName",
                },
              },
              {
                path: "team2Id",
                select: "logo coach",
                populate: {
                  path: "coach",
                  select: "teamName",
                },
              },
            ]);
            const transformedMatchups = matchups.map((matchup) => {
              const team1Doc = matchup.team1Id as any;
              const team2Doc = matchup.team2Id as any;
              const { team1Score, team2Score, winner } =
                calculateTeamMatchupScoreAndWinner(matchup);

              return {
                team1: {
                  teamName: team1Doc?.coach?.teamName || "Unknown Team",
                  coach: team1Doc?.coach?.teamName || "Unknown Coach",
                  score: team1Score,
                  logo: team1Doc?.logo || "",
                  winner:
                    winner === "team1"
                      ? true
                      : winner === "team2"
                        ? false
                        : undefined,
                },
                team2: {
                  teamName: team2Doc?.coach?.teamName || "Unknown Team",
                  coach: team2Doc?.coach?.teamName || "Unknown Coach",
                  score: team2Score,
                  logo: team2Doc?.logo || "",
                  winner:
                    winner === "team2"
                      ? true
                      : winner === "team1"
                        ? false
                        : undefined,
                },
                matches: matchup.results.map((result) => ({
                  link: result.replay || "",
                  team1: {
                    team: result.team1.pokemon.map((pokemon) => ({
                      id: pokemon.id,
                      name: pokemon.name,
                      status: pokemon.stats?.deaths
                        ? "fainted"
                        : pokemon.stats?.brought
                          ? "brought"
                          : undefined,
                    })),
                    score: calculateResultScore(result.team1),
                    winner: result.winner === "team1",
                  },
                  team2: {
                    team: result.team2.pokemon.map((pokemon) => ({
                      id: pokemon.id,
                      name: pokemon.name,
                      status: pokemon.stats?.deaths
                        ? "fainted"
                        : pokemon.stats?.brought
                          ? "brought"
                          : undefined,
                    })),
                    score: calculateResultScore(result.team2),
                    winner: result.winner === "team2",
                  },
                })),
              };
            });
            return {
              _id: stage._id,
              name: stage.name,
              matchups: transformedMatchups,
            };
          }),
        );
        return stagesWithMatchups;
      });
    });
    r.path("teams")((r) => {
      r.param("team_id", async (ctx, team_id) => {
        const team = await LeagueTeamModel.findById(team_id);
        if (!team)
          throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
            teamId: team_id,
          });
        return { team };
      })((r) => {
        r.get(async (ctx) => {
          await ctx.tournament.populate<{
            tierList: LeagueTierListDocument;
          }>("tierList");

          const draft = await Promise.all(
            ctx.team.draft.map(async (draftItem) => {
              const tier = await getPokemonTier(
                ctx.tournament,
                draftItem.pokemon.id,
              );
              const pokemonName = getName(draftItem.pokemon.id);
              return {
                id: draftItem.pokemon.id,
                name: pokemonName,
                tier,
              };
            }),
          );

          const teamMatchups = await LeagueMatchupModel.find({
            $or: [{ team1Id: ctx.team._id }, { team2Id: ctx.team._id }],
          }).populate([
            { path: "team1Id", select: "coach", populate: "coach" },
            { path: "team2Id", select: "coach", populate: "coach" },
          ]);

          const pokemonStandings = await calculateDivisionPokemonStandings(
            teamMatchups,
            ctx.team._id.toString(),
          );

          const coach = ctx.team.coach as LeagueCoachDocument;

          return {
            name: coach.teamName,
            timezone: coach.timezone,
            logo: coach.logo,
            draft,
            pokemonStandings,
          };
        });
      });
    });
    r.path("divisions")((r) => {
      r.param("division_id", DivisionHandler).auth()((r) => {
        r.get(
          async (ctx) =>
            await getDivisionDetails(ctx.tournament, ctx.division, ctx.sub),
        );
        r.path("picks")((r) => {
          r.get(async (ctx) => {
            const division = await LeagueDivisionModel.findById(
              ctx.division._id,
            ).populate<{
              teams: (LeagueTeamDocument & {
                picks: Types.DocumentArray<
                  TeamDraft & { picker: LeagueCoachDocument }
                >;
                coach: LeagueCoachDocument;
              })[];
            }>({
              path: "teams",
              populate: ["draft.picker", "coach"],
            });

            if (!division) throw new PDZError(ErrorCodes.DIVISION.NOT_FOUND);

            const allPicks = await Promise.all(
              division.teams.map(async (team) => {
                const picks = await Promise.all(
                  team.draft.map(async (draftItem) => ({
                    pokemon: {
                      id: draftItem.pokemon.id,
                      name: getName(draftItem.pokemon.id),
                      tier: await getPokemonTier(
                        ctx.tournament,
                        draftItem.pokemon.id,
                      ),
                    },
                    timestamp: draftItem.timestamp,
                    picker: (draftItem.picker as LeagueCoach)?.auth0Id,
                  })),
                );

                const coach = team.coach as LeagueCoachDocument;
                return {
                  name: coach.teamName,
                  picks: picks,
                  id: team._id.toString(),
                };
              }),
            );

            return allPicks;
          });
        });
        r.path("schedule")((r) => {
          r.get(async (ctx) => {
            const stages = await LeagueStageModel.find({
              divisionIds: ctx.division._id,
            });

            const stagesWithMatchups = await Promise.all(
              stages.map(async (stage) => {
                const matchups = await LeagueMatchupModel.find({
                  stageId: stage._id,
                }).populate([
                  {
                    path: "team1Id",
                    select: "logo coach",
                    populate: {
                      path: "coach",
                      select: "name teamName",
                    },
                  },
                  {
                    path: "team2Id",
                    select: "logo coach",
                    populate: {
                      path: "coach",
                      select: "name teamName",
                    },
                  },
                ]);

                const transformedMatchups = matchups.map((matchup) => {
                  const team1Doc = matchup.team1Id as any;
                  const team2Doc = matchup.team2Id as any;
                  const { team1Score, team2Score, winner } =
                    calculateTeamMatchupScoreAndWinner(matchup);

                  return {
                    team1: {
                      teamName: team1Doc?.coach?.teamName || "Unknown Team",
                      coach: team1Doc?.coach?.name || "Unknown Coach",
                      score: team1Score,
                      logo: team1Doc?.logo || "",
                      winner:
                        winner === "team1"
                          ? true
                          : winner === "team2"
                            ? false
                            : undefined,
                    },
                    team2: {
                      teamName: team2Doc?.coach?.teamName || "Unknown Team",
                      coach: team2Doc?.coach?.name || "Unknown Coach",
                      score: team2Score,
                      logo: team2Doc?.logo || "",
                      winner:
                        winner === "team2"
                          ? true
                          : winner === "team1"
                            ? false
                            : undefined,
                    },
                    matches: matchup.results.map((result) => ({
                      link: result.replay || "",
                      team1: {
                        team: result.team1.pokemon.map((pokemon) => ({
                          id: pokemon.id,
                          name: pokemon.name,
                          status: pokemon.stats?.deaths
                            ? "fainted"
                            : pokemon.stats?.brought
                              ? "brought"
                              : undefined,
                        })),
                        score: calculateResultScore(result.team1),
                        winner: result.winner === "team1",
                      },
                      team2: {
                        team: result.team2.pokemon.map((pokemon) => ({
                          id: pokemon.id,
                          name: pokemon.name,
                          status: pokemon.stats?.deaths
                            ? "fainted"
                            : pokemon.stats?.brought
                              ? "brought"
                              : undefined,
                        })),
                        score: calculateResultScore(result.team2),
                        winner: result.winner === "team2",
                      },
                    })),
                  };
                });

                return {
                  _id: stage._id,
                  name: stage.name,
                  matchups: transformedMatchups,
                };
              }),
            );

            return stagesWithMatchups;
          });
        });
        r.path("standings")((r) => {
          r.get(async (ctx) => {
            const stages = await LeagueStageModel.find({
              divisionIds: ctx.division._id,
            });

            const allMatchups = await LeagueMatchupModel.find({
              stageId: { $in: stages.map((s) => s._id) },
            }).populate([
              {
                path: "team1Id",
                select: "logo coach",
                populate: { path: "coach", select: "teamName" },
              },
              {
                path: "team2Id",
                select: "logo coach",
                populate: { path: "coach", select: "teamName" },
              },
            ]);

            const divisionTeams = await LeagueTeamModel.find({
              _id: { $in: ctx.division.teams },
            }).populate({ path: "coach", select: "teamName" });

            const coachStandings = await calculateDivisionCoachStandings(
              allMatchups,
              stages,
              divisionTeams,
            );

            const pokemonStandings =
              await calculateDivisionPokemonStandings(allMatchups);

            return {
              coachStandings: {
                //TODO: make dynamic
                cutoff: 8,
                weeks: stages.length,
                teams: coachStandings,
              },
              pokemonStandings,
            };
          });
        });
        r.path("order")((r) => {
          r.get(async (ctx) => {
            await ctx.division.populate<{ teams: LeagueTeamDocument[] }>(
              "teams",
            );

            const draftStyle = ctx.division.draftStyle;
            const numberOfRounds = (
              ctx.tournament.tierList as LeagueTierListDocument
            ).draftCount.max;

            const initialTeamOrder = ctx.division.teams as LeagueTeamDocument[];
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
                const coach = team.coach as LeagueCoachDocument;
                const draftPick: DraftPick = { teamName: coach.teamName };
                if (team.draft[round]) {
                  const pokemonId = team.draft[round].pokemon.id;
                  const pokemonName = getName(pokemonId);
                  draftPick.pokemon = { id: pokemonId, name: pokemonName };
                }
                if (
                  ctx.division.draftCounter ===
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
                    now.getTime() + thirtyMinutes + randomOffsetMilliseconds,
                  );
                }
                currentRound.push(draftPick);
              }
              draftRounds.push(currentRound);
            }

            return draftRounds;
          });
        });
        r.path("power-rankings").auth()((r) => {
          r.get(async (ctx) => {
            const tierList = ctx.tournament.tierList as LeagueTierListDocument;
            const ruleset = getRuleset(tierList.ruleset);
            const teams = await Promise.all(
              (
                ctx.division.teams as (LeagueTeamDocument & {
                  coach: LeagueCoachDocument;
                })[]
              ).map(async (team, index) => {
                const teamRaw = team.draft.map((pick) => ({
                  id: pick.pokemon.id,
                  capt: pick.capt,
                }));
                const draft = DraftSpecie.getTeam(teamRaw, ruleset);
                const typechart = new Typechart(draft);
                const summary = new SummaryClass(draft);
                const coach = team.coach as LeagueCoachDocument;
                return {
                  info: {
                    name: coach.teamName,
                    index,
                    id: team._id.toString(),
                  },
                  typechart: typechart.toJson(),
                  recommended: typechart.recommended(),
                  summary: summary.toJson(),
                  movechart: await movechart(draft, ruleset),
                  coverage: await plannerCoverage(draft),
                };
              }),
            );
            return teams;
          });
        });

        r.path("teams")((r) => {
          r.param("team_id", async (ctx, team_id) => {
            const team = await LeagueTeamModel.findById(team_id);
            if (!team)
              throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
                teamId: team_id,
              });
            if (!ctx.division.teams.some((t) => t._id.equals(team._id)))
              throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
                teamId: team_id,
                divisionKey: ctx.division.divisionKey,
              });
            return { team };
          })((r) => {
            r.path("draft")((r) => {
              r.post.validate({
                body: (data) =>
                  z
                    .object({
                      pokemonId: z.string().min(1),
                    })
                    .parse(data),
              })(async (ctx) => {
                const { pokemonId } = ctx.validatedBody;
                if (!(await isCoach(ctx.team, ctx.sub)))
                  throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
                    reason: "User is not a coach on this team",
                  });
                await draftPokemon(
                  ctx.tournament,
                  ctx.division,
                  ctx.team,
                  pokemonId,
                );
                return { message: "Drafted successfully." };
              });
            });
            r.path("picks")((r) => {
              r.post.validate({
                body: (data) =>
                  z
                    .object({
                      picks: z.array(z.array(z.string().min(1))),
                    })
                    .parse(data),
              })(async (ctx) => {
                ctx.team.picks = ctx.validatedBody.picks;
                await ctx.team.save();
                return { message: "Draft pick set successfully." };
              });
            });
          });
        });
      });
    });
    r.path("manage").auth()((r) => {
      r.use(rolecheck("organizer"));
      r.path("divisions")((r) => {
        r.param(
          "division_id",
          DivisionHandler,
        )((r) => {
          r.path("state")((r) => {
            r.post.validate({
              body: (data) =>
                z.object({ state: z.string().min(1) }).parse(data),
            })(async (ctx) => {
              const { state } = ctx.validatedBody;
              setDivsionState(ctx.tournament, ctx.division, state);
              return { message: "Timer set successfully." };
            });
          });
          r.path("skip")((r) => {
            r.post(async (ctx) => {
              await skipCurrentPick(ctx.tournament, ctx.division);
              return { message: "Skip successful." };
            });
          });
          r.path("setdraft")((r) => {
            r.post.validate({
              body: (data) =>
                z
                  .object({
                    pokemonId: z.string().min(1),
                    teamId: z.string().min(1),
                  })
                  .parse(data),
            })(async (ctx) => {
              const { pokemonId, teamId } = ctx.validatedBody;
              const team = ctx.division.teams.find((team) =>
                team._id.equals(teamId),
              ) as LeagueTeamDocument | undefined;
              if (!team)
                throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
                  teamId,
                });
              await draftPokemon(ctx.tournament, ctx.division, team, pokemonId);
              return { message: "Draft pick set successfully." };
            });
          });
        });
      });
    });
  });
});
