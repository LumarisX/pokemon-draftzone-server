import mongoose from "mongoose";
import { getRuleset } from "../data/rulesets";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import {
  ArchiveBaseModel,
  ArchiveV1Data,
  ArchiveV2Data,
} from "../models/draft/archive.model";
import { getName } from "../services/data-services/pokedex.service";
import { getStats } from "../services/database-services/archive.service";
import { createRoute } from "./route-builder";

export const ArchiveRoute = createRoute()((r) => {
  r.path("teams")((r) => {
    r.get.auth()(async (ctx) => {
      const rawArchives = await ArchiveBaseModel.find({
        owner: ctx.sub,
      }).sort({
        createdAt: -1,
      });

      const archives = rawArchives.map((rawArchive) => {
        const archive = rawArchive.toObject();
        return {
          ...archive,
          team: archive.team.map((pokemon) => ({
            ...pokemon,
            name: getName(pokemon.id),
          })),
        };
      });

      return archives;
    });
  });

  r.param("team_id", {
    validate: (team_id) => mongoose.Types.ObjectId.isValid(team_id),
    loader: async (ctx, team_id) => {
      const rawArchive = await ArchiveBaseModel.findById(team_id);
      if (!rawArchive) throw new PDZError(ErrorCodes.ARCHIVE.NOT_FOUND);
      const archive = rawArchive.toObject() as unknown as
        | ArchiveV1Data
        | ArchiveV2Data;
      const ruleset = getRuleset(archive.ruleset);
      return { rawArchive, archive, ruleset };
    },
  })((r) => {
    r.delete.auth()(async (ctx, req, res) => {
      await ctx.rawArchive.deleteOne();
      res.status(201).json({ message: "Draft deleted" });
    });

    r.path("stats")((r) => {
      r.get.auth()(async (ctx) => {
        return await getStats(ctx.ruleset, ctx.archive);
      });
    });
  });
});
