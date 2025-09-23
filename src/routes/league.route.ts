import { TextChannel } from "discord.js";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { Route, sendError } from ".";
import { logger } from "../app";
import { BattleZone } from "../classes/battlezone";
import { getRuleset, Ruleset } from "../data/rulesets";
import { client } from "../discord";
import eventEmitter from "../event-emitter";
import { jwtCheck } from "../middleware/jwtcheck";
import { rolecheck } from "../middleware/rolecheck";
import LeagueDivisionModel, {
  LeagueDivisionDocument,
} from "../models/league/division.model";
import LeagueModel, { LeagueDocument } from "../models/league/league.model";
import LeagueTeamModel, {
  LeagueTeam,
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
            logoUrl: team.logoUrl,
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
