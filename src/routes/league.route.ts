import { Request, Response } from "express";
import { Route, sendError } from ".";
import { PDBLModel } from "../models/pdbl.model";
import { BattleZone } from "../classes/battlezone";
import { client } from "../discord";
import { TextChannel } from "discord.js";
import mongoose, { Types } from "mongoose";
import { jwtCheck } from "../middleware/jwtcheck";
import { getRoles } from "../services/league-services/league-service";
import { rolecheck } from "../middleware/rolecheck";
import LeagueModel, { LeagueDocument } from "../models/league/league.model";
import { logger } from "../app";
import LeagueDivisionModel from "../models/league/division.model";
import LeagueUserModel, {
  LeagueUser,
  LeagueUserDocument,
} from "../models/league/user.model";
import DraftTeamModel, {
  DraftTeamDocument,
  DraftPick,
} from "../models/league/team.model";

const routeCode = "LR";

type LeagueResponse = Response & {
  league?: LeagueDocument | null;
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
            teams: (DraftTeamDocument & {
              picks: Types.DocumentArray<
                DraftPick & { picker: LeagueUserDocument }
              >;
              coaches: LeagueUserDocument[];
            })[];
          }>({
            path: "teams",
            populate: [
              {
                path: "picks.picker",
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
              picks: team.picks.map((pick) => ({
                pokemonId: pick.pokemonId,
                timestamp: pick.timestamp,
                picker: (pick.picker as LeagueUser).auth0Id,
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
          ).populate<{ teams: DraftTeamDocument[] }>("teams");

          if (!division) {
            return res.status(404).json({ message: "Division not found." });
          }

          const team = await DraftTeamModel.findById(teamId);

          if (!team) {
            return res.status(404).json({ message: "Team not found." });
          }

          if (!division.teams.some((t) => t._id.equals(team._id))) {
            return res
              .status(404)
              .json({ message: "Team not found in this division." });
          }

          const isAlreadyDrafted = division.teams.some((t) =>
            t.picks.some((p) => p.pokemonId === pokemonId)
          );

          if (isAlreadyDrafted) {
            return res
              .status(409)
              .json({ message: "Pokemon has already been drafted." });
          }

          team.picks.push({
            pokemonId: pokemonId,
            // picker: leagueUser._id,
            picker: new mongoose.Types.ObjectId(),
            timestamp: new Date(),
            isSkipped: false,
          } as DraftPick);

          await team.save();

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
          name: "Pokemon Draftzone Battle League S2",
        });
        if (!league) {
          logger.error(`League ID not found: ${league_id}`);
          return res.status(404).json({
            message: "League ID not found.",
            code: `${routeCode}-P1-02`,
          });
        }
        res.league = league;
        next();
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
    },
  },
};
