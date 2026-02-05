import { startSession } from "mongoose";
import { z } from "zod";
import { Archive } from "../classes/archive";
import { Draft } from "../classes/draft";
import { GameTime, Matchup, Score } from "../classes/matchup";
import { Opponent } from "../classes/opponent";
import { getRuleset } from "../data/rulesets";
import { DraftData } from "../models/draft/draft.model";
import { MatchupData, MatchupDocument } from "../models/draft/matchup.model";
import {
  createDraft,
  deleteDraft,
  getDraft,
  getDraftsByOwner,
  getStats,
  updateDraft,
} from "../services/database-services/draft.service";
import {
  clearMatchupCacheById,
  createMatchup,
  getMatchupById,
  getMatchupsByDraftId,
  updateMatchup,
} from "../services/database-services/matchup.service";
import { createRoute } from "./route-builder";

export const DraftRoute = createRoute().auth()((r) => {
  r.path("teams")((r) => {
    r.get(async (ctx) => {
      const drafts = await getDraftsByOwner(ctx.sub);
      return await Promise.all(
        drafts.map(async (draft) => await Draft.fromData(draft).toClient()),
      );
    });
    r.post.validate({
      //TODO: refine this schema
      body: (data) => z.any().parse(data),
    })(async (ctx, req, res) => {
      const draft = Draft.fromForm(ctx.validatedBody, ctx.sub);
      await createDraft(draft.toData());
      res.status(201).json({ message: "Draft Added" });
    });
  });
  r.param("team_id", async (ctx, team_id) => {
    const rawDraft = await getDraft(team_id, ctx.sub);
    const ruleset = getRuleset(rawDraft.ruleset);
    const draft = Draft.fromData(rawDraft, ruleset);
    return { rawDraft, ruleset, draft, team_id };
  })((r) => {
    r.get(async (ctx) => {
      return await ctx.draft.toClient();
    });
    r.patch.validate({
      body: (data) =>
        //TODO: refine this schema
        z
          .object({
            leagueName: z.string().min(1),
            teamName: z.string().min(1),
            format: z.string().min(1),
            ruleset: z.string().min(1),
            doc: z.string().min(1).optional(),
            team: z.array(z.any()),
          })
          .parse(data),
    })(async (ctx) => {
      const draft = Draft.fromForm(ctx.validatedBody, ctx.sub).toData();
      const updatedDraft = await updateDraft(ctx.sub, ctx.team_id, draft);
      const matchups = await getMatchupsByDraftId(updatedDraft._id);
      matchups.forEach((matchup) =>
        clearMatchupCacheById(matchup._id.toString()),
      );
      return { message: "Draft Updated", draft: updatedDraft };
    });
    r.delete(async (ctx, req, res) => {
      await deleteDraft(ctx.rawDraft);
      res.status(201).json({ message: "Draft deleted" });
    });
    r.path("matchups")((r) => {
      r.get(async (ctx) => {
        const matchups: MatchupDocument[] = await ctx.draft.getMatchups();
        return await Promise.all(
          matchups.map(async (rawMatchup) => {
            const matchupData = rawMatchup.toObject<MatchupData>();
            const matchup = await Matchup.fromData(matchupData);
            return matchup.toOpponent().toClient();
          }),
        );
      });
      r.post.validate({
        //TODO: refine this schema
        body: (data) => z.any().parse(data),
      })(async (ctx, req, res) => {
        const opponent = Opponent.fromForm(ctx.validatedBody, ctx.ruleset);
        const matchup = Matchup.fromForm(ctx.draft, opponent);
        await createMatchup(matchup.toData());
        res.status(201).json({ message: "Matchup Added" });
      });
    });
    r.path("stats")((r) => {
      r.get(async (ctx) => await getStats(ctx.ruleset, ctx.rawDraft._id));
    });
    r.path("archive")((r) => {
      r.delete(async (ctx, req, res) => {
        const session = await startSession();
        session.startTransaction();
        try {
          const archive = new Archive(ctx.rawDraft.toObject<DraftData>());
          const archiveData = await archive.createArchive();
          await deleteDraft(ctx.rawDraft);
          archiveData.save({ session });
          await session.commitTransaction();
          res.status(201).json({ message: "Archive added" });
        } catch (error) {
          await session.abortTransaction();
          throw error;
        } finally {
          session.endSession();
        }
      });
    });
    r.param("matchup_id", async (ctx, matchup_id) => {
      const rawMatchup = await getMatchupById(matchup_id);
      const matchup = rawMatchup.toObject<MatchupData>();
      const matchupInstance = await Matchup.fromData(matchup, ctx.draft);
      return { rawMatchup, matchup: matchupInstance, matchup_id };
    })((r) => {
      r.get(async (ctx) => ctx.matchup.toClient());
      r.path("opponent")((r) => {
        r.get(async (ctx) => ctx.matchup.toOpponent().toClient());
        r.patch.validate({
          body: (data) =>
            z
              .object({
                stage: z.string().min(1),
                teamName: z.string().min(1),
                coach: z.string().min(1).optional(),
                team: z.array(z.any()),
                matches: z.array(z.any()),
                _id: z.string().min(1),
              })
              .parse(data),
        })(async (ctx) => {
          const opponent = Opponent.fromForm(ctx.validatedBody, ctx.ruleset);
          const updatedMatchup = await updateMatchup(
            ctx.matchup_id,
            opponent.toData(),
          );
          clearMatchupCacheById(ctx.matchup_id);
          return { message: "Matchup Updated", draft: updatedMatchup };
        });
      });
      r.path("score")((r) => {
        r.patch.validate({
          //TODO: refine this schema
          body: (data) => z.any().parse(data),
        })(async (ctx) => {
          const score = new Score(ctx.validatedBody);
          const processedScore = await score.processScore();
          const updatedMatchup = await updateMatchup(ctx.matchup_id, {
            matches: processedScore.matches,
            "aTeam.paste": processedScore.aTeamPaste,
            "bTeam.paste": processedScore.bTeamPaste,
          });
          return { message: "Matchup Updated", draft: updatedMatchup };
        });
      });
      r.path("schedule")((r) => {
        r.get(async (ctx) => {
          return {
            gameTime: ctx.matchup.gameTime,
            reminder: ctx.matchup.reminder,
          };
        });
        r.patch.validate({
          //TODO: refine this schema
          body: (data) => z.any().parse(data),
        })(async (ctx, req, res) => {
          const time = new GameTime(ctx.validatedBody);
          const processedTime = await time.processTime();
          const updatedMatchup = await updateMatchup(ctx.matchup_id, {
            gameTime: processedTime.dateTime,
            reminder: processedTime.emailTime,
          });
          if (updatedMatchup) {
            return { message: "Matchup Updated", draft: updatedMatchup };
          } else {
            res.status(404).json({
              message: "Matchup not found",
              code: `DR-R6-03`,
            });
          }
        });
      });
    });
  });
});
