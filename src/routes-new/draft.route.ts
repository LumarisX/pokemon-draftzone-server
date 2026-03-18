import { startSession } from "mongoose";
import { z } from "zod";
import { Archive } from "../classes/archive";
import { Draft } from "../classes/draft";
import { GameTime, Matchup, Score } from "../classes/matchup";
import { Opponent } from "../classes/opponent";
import { getRuleset } from "../data/rulesets";
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
  updateMatchupScore,
} from "../services/database-services/matchup.service";
import { getTournamentsByOwner } from "../services/league-services/league-service";
import { createRoute } from "./route-builder";

const scorePokemonSchema = z.object({
  pokemon: z.object({ id: z.string().min(1) }),
  kills: z.coerce.number().int().nonnegative(),
  fainted: z.coerce.number().int().nonnegative(),
  indirect: z.coerce.number().int().nonnegative(),
  brought: z.coerce.number().int().nonnegative(),
});

const scorePatchSchema = z.object({
  aTeamPaste: z.string(),
  bTeamPaste: z.string(),
  matches: z.array(
    z.object({
      replay: z.string().nullable(),
      winner: z.enum(["a", "b", ""]),
      aTeam: z.object({
        team: z.array(scorePokemonSchema),
      }),
      bTeam: z.object({
        team: z.array(scorePokemonSchema),
      }),
    }),
  ),
});

export const DraftRoute = createRoute().auth()((r) => {
  r.path("teams")((r) => {
    r.get(async (ctx) => {
      const draftDocs = await getDraftsByOwner(ctx.sub);
      const drafts = await Promise.all(
        draftDocs.map(async (draft) => await Draft.fromData(draft).toClient()),
      );
      const tournaments = await getTournamentsByOwner(ctx.sub);
      return { drafts, tournaments };
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
    r.get(async (ctx) => await ctx.draft.toClient());
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
    r.delete(async (ctx) => {
      await deleteDraft(ctx.rawDraft);
      return { message: "Draft deleted" };
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
        try {
          await session.withTransaction(
            async () => {
              const archive = new Archive(ctx.rawDraft);
              const archiveData = await archive.createArchive();
              await archiveData.save({ session });
              await deleteDraft(ctx.rawDraft, session);
            },
            { writeConcern: { w: "majority" } },
          );
          res.status(201).json({ message: "Archive added" });
        } catch (error) {
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
                matches: z.array(z.any()).optional(),
                _id: z.string().min(1).optional(),
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
          body: (data) => scorePatchSchema.parse(data),
        })(async (ctx) => {
          const score = new Score(ctx.validatedBody);
          const processedScore = await score.processScore();
          const updatedMatchup = await updateMatchupScore(
            ctx.matchup_id,
            processedScore.matches,
            processedScore.aTeamPaste,
            processedScore.bTeamPaste,
          );
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
