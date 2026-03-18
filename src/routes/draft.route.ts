import { RequestHandler, Response, Router } from "express";
import { startSession } from "mongoose";
import { z } from "zod";
import { Archive } from "../classes/archive";
import { Draft } from "../classes/draft";
import { GameTime, Matchup, Score } from "../classes/matchup";
import { Opponent } from "../classes/opponent";
import { Ruleset, getRuleset } from "../data/rulesets";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { jwtCheck } from "../middleware/jwtcheck";
import { DraftDocument } from "../models/draft/draft.model";
import { MatchupData, MatchupDocument } from "../models/draft/matchup.model";
import { validateBody } from "./validation";
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
import { getTournamentsByOwner } from "../services/league-services/league-service";

type AuthLocals = {
  sub: string;
};

type TeamLocals = AuthLocals & {
  team_id: string;
  rawDraft: DraftDocument;
  ruleset: Ruleset;
  draft: Draft;
};

type MatchupLocals = TeamLocals & {
  matchup_id: string;
  rawMatchup: MatchupDocument;
  matchup: Matchup;
};

const draftPatchSchema = z.object({
  leagueName: z.string().min(1),
  teamName: z.string().min(1),
  format: z.string().min(1),
  ruleset: z.string().min(1),
  doc: z.string().min(1).optional(),
  team: z.array(z.any()),
});

const opponentPatchSchema = z.object({
  stage: z.string().min(1),
  teamName: z.string().min(1),
  coach: z.string().min(1).optional(),
  team: z.array(z.any()),
  matches: z.array(z.any()).optional(),
  _id: z.string().min(1).optional(),
});

const scorePokemonSchema = z.object({
  pokemon: z.object({ id: z.string().min(1) }),
  kills: z.number().int().nonnegative(),
  fainted: z.number().int().nonnegative(),
  indirect: z.number().int().nonnegative(),
  brought: z.number().int().nonnegative(),
});

const scorePatchSchema = z.object({
  aTeamPaste: z.string(),
  bTeamPaste: z.string(),
  matches: z.array(
    z.object({
      replay: z.string(),
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

const createDraftSchema = z.any();
const createMatchupSchema = z.any();
const schedulePatchSchema = z.any();

function authLocals(res: Response): AuthLocals {
  return res.locals as AuthLocals;
}

function teamLocals(res: Response): TeamLocals {
  return res.locals as TeamLocals;
}

function matchupLocals(res: Response): MatchupLocals {
  return res.locals as MatchupLocals;
}

const requireAuthSub: RequestHandler = (req, res, next) => {
  const sub = req.auth?.payload?.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new PDZError(ErrorCodes.AUTH.INVALID_TOKEN);
  }
  authLocals(res).sub = sub;
  next();
};

const loadTeamContext: RequestHandler = async (req, res, next) => {
  const locals = authLocals(res);
  const team_id = req.params.team_id;
  const rawDraft = await getDraft(team_id, locals.sub);
  const ruleset = getRuleset(rawDraft.ruleset);
  const draft = Draft.fromData(rawDraft, ruleset);

  Object.assign(res.locals, {
    team_id,
    rawDraft,
    ruleset,
    draft,
  } satisfies Pick<TeamLocals, "team_id" | "rawDraft" | "ruleset" | "draft">);

  next();
};

const loadMatchupContext: RequestHandler = async (req, res, next) => {
  const locals = teamLocals(res);
  const matchup_id = req.params.matchup_id;
  const rawMatchup = await getMatchupById(matchup_id);
  const matchupData = rawMatchup.toObject<MatchupData>();
  const matchup = await Matchup.fromData(matchupData, locals.draft);

  Object.assign(res.locals, {
    matchup_id,
    rawMatchup,
    matchup,
  } satisfies Pick<MatchupLocals, "matchup_id" | "rawMatchup" | "matchup">);

  next();
};

export const DraftRoute = Router();

DraftRoute.use(jwtCheck, requireAuthSub);

DraftRoute.get("/teams", async (_req, res) => {
  const { sub } = authLocals(res);
  const draftDocs = await getDraftsByOwner(sub);
  const drafts = await Promise.all(
    draftDocs.map(async (draft) => await Draft.fromData(draft).toClient()),
  );
  const tournaments = await getTournamentsByOwner(sub);
  return res.json({ drafts, tournaments });
});

DraftRoute.post("/teams", async (req, res) => {
  const { sub } = authLocals(res);
  const validatedBody = validateBody(createDraftSchema, req.body);
  const draft = Draft.fromForm(validatedBody, sub);
  await createDraft(draft.toData());
  return res.status(201).json({ message: "Draft Added" });
});

const teamRouter = Router({ mergeParams: true });
DraftRoute.use("/:team_id", loadTeamContext, teamRouter);

teamRouter.get("/", async (_req, res) => {
  const { draft } = teamLocals(res);
  return res.json(await draft.toClient());
});

teamRouter.patch("/", async (req, res) => {
  const { sub, team_id } = teamLocals(res);
  const validatedBody = validateBody(draftPatchSchema, req.body);
  const draft = Draft.fromForm(validatedBody, sub).toData();
  const updatedDraft = await updateDraft(sub, team_id, draft);
  const matchups = await getMatchupsByDraftId(updatedDraft._id);
  matchups.forEach((matchup) => clearMatchupCacheById(matchup._id.toString()));
  return res.json({ message: "Draft Updated", draft: updatedDraft });
});

teamRouter.delete("/", async (_req, res) => {
  const { rawDraft } = teamLocals(res);
  await deleteDraft(rawDraft);
  return res.json({ message: "Draft deleted" });
});

teamRouter.get("/matchups", async (_req, res) => {
  const { draft } = teamLocals(res);
  const matchups: MatchupDocument[] = await draft.getMatchups();
  const opponents = await Promise.all(
    matchups.map(async (rawMatchup) => {
      const matchupData = rawMatchup.toObject<MatchupData>();
      const matchup = await Matchup.fromData(matchupData);
      return matchup.toOpponent().toClient();
    }),
  );

  return res.json(opponents);
});

teamRouter.post("/matchups", async (req, res) => {
  const { draft, ruleset } = teamLocals(res);
  const validatedBody = validateBody(createMatchupSchema, req.body);
  const opponent = Opponent.fromForm(validatedBody, ruleset);
  const matchup = Matchup.fromForm(draft, opponent);
  await createMatchup(matchup.toData());
  return res.status(201).json({ message: "Matchup Added" });
});

teamRouter.get("/stats", async (_req, res) => {
  const { ruleset, rawDraft } = teamLocals(res);
  return res.json(await getStats(ruleset, rawDraft._id));
});

teamRouter.delete("/archive", async (_req, res) => {
  const { rawDraft } = teamLocals(res);
  const session = await startSession();

  try {
    await session.withTransaction(
      async () => {
        const archive = new Archive(rawDraft);
        const archiveData = await archive.createArchive();

        if (archiveData.matchups?.[0]?.matches?.[0]) {
          console.log(
            "First match aTeam stats:",
            JSON.stringify(
              archiveData.matchups[0].matches[0].aTeam.stats,
              null,
              2,
            ),
          );
        }

        await archiveData.save({ session });
        await deleteDraft(rawDraft, session);
      },
      { writeConcern: { w: "majority" } },
    );

    return res.status(201).json({ message: "Archive added" });
  } catch (error) {
    console.log("Error creating archive:", error);
    throw error;
  } finally {
    session.endSession();
  }
});

const matchupRouter = Router({ mergeParams: true });
teamRouter.use("/:matchup_id", loadMatchupContext, matchupRouter);

matchupRouter.get("/", async (_req, res) => {
  const { matchup } = matchupLocals(res);
  return res.json(matchup.toClient());
});

matchupRouter.get("/opponent", async (_req, res) => {
  const { matchup } = matchupLocals(res);
  return res.json(matchup.toOpponent().toClient());
});

matchupRouter.patch("/opponent", async (req, res) => {
  const { matchup_id, ruleset } = matchupLocals(res);
  const validatedBody = validateBody(opponentPatchSchema, req.body);
  const opponent = Opponent.fromForm(validatedBody, ruleset);
  const updatedMatchup = await updateMatchup(matchup_id, opponent.toData());
  clearMatchupCacheById(matchup_id);
  return res.json({ message: "Matchup Updated", draft: updatedMatchup });
});

matchupRouter.patch("/score", async (req, res) => {
  const { matchup_id } = matchupLocals(res);
  const validatedBody = validateBody(scorePatchSchema, req.body);
  const score = new Score(validatedBody);
  const processedScore = await score.processScore();
  const updatedMatchup = await updateMatchup(matchup_id, {
    matches: processedScore.matches,
    "aTeam.paste": processedScore.aTeamPaste,
    "bTeam.paste": processedScore.bTeamPaste,
  });

  return res.json({ message: "Matchup Updated", draft: updatedMatchup });
});

matchupRouter.get("/schedule", async (_req, res) => {
  const { matchup } = matchupLocals(res);
  return res.json({
    gameTime: matchup.gameTime,
    reminder: matchup.reminder,
  });
});

matchupRouter.patch("/schedule", async (req, res) => {
  const { matchup_id } = matchupLocals(res);
  const validatedBody = validateBody(schedulePatchSchema, req.body);
  const time = new GameTime(validatedBody);
  const processedTime = await time.processTime();
  const updatedMatchup = await updateMatchup(matchup_id, {
    gameTime: processedTime.dateTime,
    reminder: processedTime.emailTime,
  });

  if (!updatedMatchup) {
    return res.status(404).json({
      message: "Matchup not found",
      code: "DR-R6-03",
    });
  }

  return res.json({ message: "Matchup Updated", draft: updatedMatchup });
});
