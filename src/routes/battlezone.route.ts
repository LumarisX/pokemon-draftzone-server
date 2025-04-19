import { TextChannel } from "discord.js";
import type { Request, Response } from "express";
import { type Route } from ".";
import { BattleZone } from "../classes/battlezone";
import { getTiers } from "../data/pdbl";
import { PDBLModel } from "../models/pdbl.model";
import { client } from "../discord";

export const BattleZoneRoutes: Route = {
  subpaths: {
    "/pdbl": {
      get: async (req: Request, res: Response) => {
        res.json({
          format: "Singles",
          ruleset: "Gen9 NatDex",
          draft: [
            new Date("2025-02-18T12:00:00"),
            new Date("2025-02-22T12:00:00"),
          ],
          season: [
            new Date("2025-02-23T12:00:00"),
            new Date("2025-04-20T12:00:00"),
          ],
          prize: 60,
        });
      },
    },
    "/pdbl/tiers": {
      get: async (req: Request, res: Response) => {
        try {
          res.json(getTiers());
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "BR-R2-01" });
        }
      },
    },

    "/pdbl/signup": {
      post: async (req: Request, res: Response) => {
        try {
          const signup = BattleZone.validateSignUpForm(req.body);
          const existing = await PDBLModel.find({ name: signup.name });
          if (existing.length > 0)
            return res
              .status(409)
              .json({ message: "User is already signed up" });
          signup.toDocument().save();
          if (client) {
            const guild = await client.guilds.fetch("1183936734719922176");
            if (!guild) {
              console.error("Guild not found");
              return;
            }

            // Fetch the channel from the guild
            const channel = guild.channels.cache.get(
              "1303896194187132978"
            ) as TextChannel;
            if (!channel || !channel.isTextBased()) {
              console.error("Channel not found or not a text channel");
              return;
            }

            // Send a message in the designated channel
            channel.send(
              `${signup.name} signed up for the league. Total signed up: ${
                existing.length + 1
              }.`
            );
          }
          return res
            .status(201)
            .json({ message: "Sign up successfully created." });
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ message: (error as Error).message, code: "BR-R1-01" });
        }
      },
    },
  },
};
