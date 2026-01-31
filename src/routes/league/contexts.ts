import { Request, Response } from "express";
import { Ruleset, getRuleset } from "../../data/rulesets";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import LeagueModel, { LeagueDocument } from "../../models/league/league.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
} from "../../models/league/team.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";

/**
 * Context for routes that have loaded a league
 */
export type LeagueContext = {
  league: LeagueDocument;
  ruleset: Ruleset;
};

/**
 * Context for routes that have loaded a league and division
 */
export type DivisionContext = LeagueContext & {
  division: LeagueDivisionDocument;
};

/**
 * Context for routes that have loaded a league, division, and team
 */
export type TeamContext = DivisionContext & {
  team: LeagueTeamDocument;
};

/**
 * Middleware to load league by key from route params
 */
export async function withLeagueByKey(
  req: Request,
  res: Response,
): Promise<LeagueContext> {
  const league = await LeagueModel.findOne({
    leagueKey: req.params.league_key,
  }).populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  if (!league) {
    throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
      leagueKey: req.params.league_key,
    });
  }

  const ruleset = getRuleset(league.tierList.ruleset);

  return { league, ruleset };
}

/**
 * Middleware to load league by ID from route params
 */
export async function withLeagueById(
  req: Request,
  res: Response,
): Promise<LeagueContext> {
  const league = await LeagueModel.findById(req.params.league_id).populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  if (!league) {
    throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
      leagueId: req.params.league_id,
    });
  }

  const ruleset = getRuleset(league.tierList.ruleset);

  return { league, ruleset };
}

/**
 * Middleware to load division - depends on LeagueContext
 */
export async function withDivision(
  req: Request,
  res: Response,
  ctx: LeagueContext,
): Promise<Pick<DivisionContext, "division">> {
  await ctx.league.populate<{ divisions: LeagueDivisionDocument[] }>(
    "divisions",
  );

  const division_id = req.params.division_id;
  const division = (ctx.league.divisions as LeagueDivisionDocument[]).find(
    (d) => d.divisionKey === division_id,
  );

  if (!division) {
    throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE, {
      divisionKey: division_id,
      leagueKey: ctx.league.leagueKey,
    });
  }

  await division.populate<{
    teams: LeagueTeamDocument[];
  }>("teams");

  return { division };
}

/**
 * Middleware to load team - depends on DivisionContext
 */
export async function withTeam(
  req: Request,
  res: Response,
  ctx: DivisionContext,
): Promise<Pick<TeamContext, "team">> {
  const team_id = req.params.team_id;
  const team = await LeagueTeamModel.findById(team_id);

  if (!team) {
    throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: team_id });
  }

  // Verify team is in the division
  if (!ctx.division.teams.some((t) => t._id.equals(team._id))) {
    throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
      teamId: team_id,
      divisionKey: ctx.division.divisionKey,
    });
  }

  return { team };
}

/**
 * Alternative team loader that doesn't require division context
 * Useful for routes like /:league_key/teams/:team_id
 */
export async function withTeamOnly(
  req: Request,
  res: Response,
  ctx: LeagueContext,
): Promise<Pick<TeamContext, "team">> {
  const team_id = req.params.team_id;
  const team = await LeagueTeamModel.findById(team_id);

  if (!team) {
    throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: team_id });
  }

  return { team };
}
