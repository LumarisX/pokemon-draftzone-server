import { TextChannel } from "discord.js";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { Route, sendError } from ".";
import { logger } from "../app";
import { BattleZone } from "../classes/battlezone";
import { client } from "../discord";
import eventEmitter from "../event-emitter";
import { jwtCheck } from "../middleware/jwtcheck";
import { rolecheck } from "../middleware/rolecheck";
import LeagueDivisionModel from "../models/league/division.model";
import LeagueModel, { LeagueDocument } from "../models/league/league.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  TeamDraft,
  TeamPicks,
} from "../models/league/team.model";
import { DraftTierListDocument } from "../models/league/tier-list.model";
import { LeagueUser, LeagueUserDocument } from "../models/league/user.model";
import { PDBLModel } from "../models/pdbl.model";
import {
  getDrafted,
  getRoles,
  getTierList,
} from "../services/league-services/league-service";
import { getPokemonTier } from "../services/league-services/tier-service";
import { getRuleset, Ruleset } from "../data/rulesets";
import { getName } from "../services/data-services/pokedex.service";

const routeCode = "LR";

type LeagueResponse = Response & {
  league?: LeagueDocument | null;
  ruleset?: Ruleset | null;
};

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
    "/:league_id/roles": {
      get: async function (req: Request, res: Response) {
        try {
          res.json(getRoles(req.auth?.payload.sub));
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-01`);
        }
      },
      middleware: [jwtCheck],
    },
    "/:league_id/rules": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          res.json(res.league!.rules);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
        }
      },
    },
    "/:league_id/tier-list": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          const tierList = await getTierList(res.league!);
          const divisions = await getDrafted(res.league!);
          res.json({ tierList, divisions });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
        }
      },
    },

    // "/:league_id/teams": {
    //   get: async function (req: Request, res: LeagueResponse) {
    //     try {
    //       await res.league!.populate<{
    //         tierList: DraftTierListDocument;
    //       }>("tierList");
    //       const tierList = res.league!.tierList as DraftTierListDocument;

    //       const draft = await Promise.all(
    //         team.draft.map(async (draftItem) => {
    //           const tier = await getPokemonTier(
    //             res.league!,
    //             draftItem.pokemonId
    //           );
    //           return { id: draftItem.pokemonId, tier };
    //         })
    //       );

    //       const picks: TeamPicks[] = [];
    //       for (let i = 0; i < tierList.draftCount[1] - draft.length; i++) {
    //         picks.push(team.picks[i] ?? []);
    //       }
    //       res.json({
    //         name: team.name,
    //         logoUrl: team.logoUrl,
    //         draft,
    //         picks,
    //       });
    //     } catch (error) {
    //       return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
    //     }
    //   },
    // },

    "/:league_id/teams/:team_id": {
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

          const picks: TeamPicks[] = [];
          for (let i = 0; i < tierList.draftCount[1] - draft.length; i++) {
            picks.push(team.picks[i] ?? []);
          }
          res.json({
            name: team.name,
            logoUrl: team.logoUrl,
            draft,
            picks,
          });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R2-01`);
        }
      },
    },

    "/:league_id/:division_id/picks": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          const { division_id } = req.params;

          if (!res.league) {
            return sendError(
              res,
              404,
              new Error("League not found."),
              `${routeCode}-R3-01`
            );
          }

          if (!res.league.divisions.some((d) => d.toString() === division_id)) {
            return sendError(
              res,
              404,
              new Error("Division not found in this league."),
              `${routeCode}-R3-02`
            );
          }

          const divisions = await LeagueDivisionModel.findById(
            division_id
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

          if (!divisions) {
            return sendError(
              res,
              404,
              new Error("Division not found."),
              `${routeCode}-R3-03`
            );
          }

          const allPicks = divisions.teams.map((team) => {
            return {
              name: team.name,
              picks: team.draft.map((draft) => ({
                pokemonId: draft.pokemonId,
                timestamp: draft.timestamp,
                picker: (draft.picker as LeagueUser).auth0Id,
              })),
              id: team._id.toString(),
            };
          });

          res.json(allPicks);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R3-04`);
        }
      },
    },

    "/:league_id/division/:division_id/order": {
      get: async function (req: Request, res: LeagueResponse) {
        try {
          res.json([
            [
              {
                teamName: "Mighty Murkrow",
                pokemon: { id: "tapukoko", name: "Tapu Koko" },
              },
              {
                teamName: "Montreal Mean Mareanies",
                pokemon: { id: "dragapult", name: "Dragapult" },
              },
              {
                teamName: "Philadelphia Flygons",
                pokemon: { id: "latiosmega", name: "Mega Latios" },
              },
              {
                teamName: "London Vespiquens",
                pokemon: { id: "ironvaliant", name: "Iron Valiant" },
              },
              {
                teamName: "Chicago White Fox",
                pokemon: { id: "zamazenta", name: "Zamazenta" },
              },
              {
                teamName: "Victorious Vigoroths",
                pokemon: { id: "landorustherian", name: "Landorus-Therian" },
              },
              {
                teamName: "Alpine Arcanines",
                pokemon: { id: "tornadustherian", name: "Tornadus-Therian" },
              },
              {
                teamName: "Twinleaf Tatsugiri",
                pokemon: { id: "tapulele", name: "Tapu Lele" },
              },
              {
                teamName: "Kalos Quagsires",
                pokemon: { id: "urshifu", name: "Urshifu-Single" },
              },
              {
                teamName: "Tampa T-Chainz",
                pokemon: { id: "chiyu", name: "Chi-Yu" },
              },
              {
                teamName: `Fitchburg's Sun Chasers`,
                pokemon: { id: "roaringmoon", name: "Roaring Moon	" },
              },
              {
                teamName: "Deep Sea Duskulls",
                pokemon: { id: "gholdengo", name: "Gholdengo" },
              },
              {
                teamName: `I like 'em THICC`,
                status: "Skipped",
              },
              {
                teamName: `Midnight teddy's`,
                pokemon: { id: "zeraora", name: "Zeraora" },
              },
              {
                teamName: `Chicago Sky Attack`,
                pokemon: { id: "zygarde", name: "Zygarde" },
              },
              {
                teamName: `Deimos Deoxys`,
                pokemon: { id: "archaludon", name: "Archaludon" },
              },
            ],
            [
              {
                teamName: "Mighty Murkrow",
              },
              {
                teamName: "Montreal Mean Mareanies",
              },
              {
                teamName: "Philadelphia Flygons",
              },
              {
                teamName: "London Vespiquens",
              },
              {
                teamName: "Chicago White Fox",
              },
              {
                teamName: "Victorious Vigoroths",
              },
              {
                teamName: "Alpine Arcanines",
              },
              {
                teamName: "Twinleaf Tatsugiri",
              },
              {
                teamName: "Kalos Quagsires",
              },
              {
                teamName: "Tampa T-Chainz",
              },
              {
                teamName: `Fitchburg's Sun Chasers`,
              },
              {
                teamName: "Deep Sea Duskulls",
                status: "On Deck",
              },
              {
                teamName: `I like 'em THICC`,
                status: "Picking",
              },
              {
                teamName: `Midnight teddy's`,
                pokemon: { id: "infernape", name: "Infernape" },
              },
              {
                teamName: `Chicago Sky Attack`,
                pokemon: { id: "scizormega", name: "Scizor-Mega" },
              },
              {
                teamName: `Deimos Deoxys`,
                pokemon: { id: "pelipper", name: "Pelipper" },
              },
            ].reverse(),
          ]);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R3-04`);
        }
      },
    },

    "/:league_id/setdraft": {
      post: async function (req: Request, res: LeagueResponse) {
        try {
          const { divisionId, pokemonId, teamId } = req.body;

          if (!divisionId || !pokemonId || !teamId) {
            return res.status(400).json({
              message: "Missing required fields: divisionId, pokemonId, teamId",
            });
          }

          // const leagueUser: LeagueUserDocument | null =
          //   await LeagueUserModel.findOne({
          //     auth0Id: req.auth!.payload.sub!,
          //   });
          // if (!leagueUser) {
          //   return res.status(403).json({ message: "User not found." });
          // }

          if (!res.league!.divisions.some((d) => d.toString() === divisionId)) {
            return res
              .status(404)
              .json({ message: "Division not found in this league." });
          }

          const division = await LeagueDivisionModel.findById(
            divisionId
          ).populate<{ teams: LeagueTeamDocument[] }>("teams");

          if (!division) {
            return res.status(404).json({ message: "Division not found." });
          }

          const team = await LeagueTeamModel.findById(teamId);

          if (!team) {
            return res.status(404).json({ message: "Team not found." });
          }

          if (!division.teams.some((t) => t._id.equals(team._id))) {
            return res
              .status(404)
              .json({ message: "Team not found in this division." });
          }

          const isAlreadyDrafted = division.teams.some((t) =>
            t.draft.some((p) => p.pokemonId === pokemonId)
          );

          if (isAlreadyDrafted) {
            return res
              .status(409)
              .json({ message: "Pokemon has already been drafted." });
          }

          team.draft.push({
            pokemonId: pokemonId,
            // picker: leagueUser._id,
            //TODO: Make this dynamic
            picker: team.coaches[0]._id,
            timestamp: new Date(),
          });

          await team.save();

          eventEmitter.emit("draft.added", {
            leagueId: res.league!._id.toString(),
            pick: {
              pokemonId,
              teamId,
              division: division.name,
            },
          });

          return res
            .status(200)
            .json({ message: "Draft pick set successfully." });
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-02`);
        }
      },
      middleware: [jwtCheck, rolecheck("organizer")],
    },
    "/:league_id/signup": {
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
        const league = await LeagueModel.findOne({
          leagueId: league_id,
        }).populate<{
          tierList: DraftTierListDocument;
        }>("tierList");
        if (!league) {
          logger.error(`League ID not found: ${league_id}`);
          return res.status(404).json({
            message: "League ID not found.",
            code: `${routeCode}-P1-02`,
          });
        }
        res.league = league;

        res.ruleset = getRuleset(league.tierList.ruleset);

        next();
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
    },
  },
};
