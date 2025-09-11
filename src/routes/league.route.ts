import { Request, Response } from "express";
import { jwtCheck, Route, sendError } from ".";
import { PDBLModel } from "../models/pdbl.model";
import { BattleZone } from "../classes/battlezone";
import { client } from "../discord";
import { TextChannel } from "discord.js";

const routeCode = "LR";

export const LeagueRoutes: Route = {
  middleware: [jwtCheck],
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
          const roles = [];
          if (
            req.auth!.payload.sub! === "google-oauth2|110216442143129521066" ||
            req.auth!.payload.sub! === "oauth2|discord|491431053471383575"
          ) {
            roles.push("organizer");
          }
          res.json(roles);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-01`);
        }
      },
      middleware: [jwtCheck],
    },

    "/:league_id/signup": {
      get: async function (req: Request, res: Response) {
        try {
          const responses = await PDBLModel.find();
          res.json(responses);
        } catch (error) {
          return sendError(res, 500, error as Error, `${routeCode}-R1-01`);
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
    league_id: async function (req: Request, res: Response, next, league_id) {
      try {
      } catch (error) {
        return sendError(res, 500, error as Error, `DR-P2-02`);
      }
      next();
    },
  },
};
