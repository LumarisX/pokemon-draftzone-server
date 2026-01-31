import { Request, Response } from "express";
import { RouteBuilder } from "./route-builder-v2";
import { TeamContext } from "./contexts";
import { jwtCheck } from "../../middleware/jwtcheck";
import { rolecheck } from "../../middleware/rolecheck";
import { getName } from "../../services/data-services/pokedex.service";
import { plannerCoverage } from "../../services/matchup-services/coverage.service";
import { movechart } from "../../services/matchup-services/movechart.service";
import { SummaryClass } from "../../services/matchup-services/summary.service";
import { Typechart } from "../../services/matchup-services/typechart.service";
import { s3Service } from "../../services/s3.service";
import { PDZError } from "../../errors/pdz-error";
import { ErrorCodes } from "../../errors/error-codes";

/**
 * Team-specific routes (requires team context)
 */
export function addTeamRoutes<TContext extends TeamContext>(
  builder: RouteBuilder<TContext>,
): RouteBuilder<TContext> {
  return (
    builder
      // Get team details
      .get("", async (req: Request, res: Response, ctx) => {
        const team = ctx.team;
        const league = ctx.league;
        const ruleset = ctx.ruleset!;

        const drafted = team.draft.map((p) => ({
          name: getName(p.name, ruleset.gen),
          id: p.name,
          tier: p.tier,
          free: p.free,
        }));

        const teamData = {
          _id: team._id,
          name: team.name,
          coach: team.coach,
          logo: team.logo,
          draft: drafted,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          points: team.points,
          format: league.format,
        };

        // Generate matchup analysis
        const typechart = new Typechart(team.draft, ruleset);
        const summary = new SummaryClass(team.draft, ruleset);
        const coverage = plannerCoverage(team.draft, ruleset);
        const movechart_data = movechart(team.draft, ruleset);

        res.json({
          team: teamData,
          typechart: typechart.getTypechart(),
          summary: summary.getSummary(),
          coverage: coverage.getChart(),
          movechart: movechart_data.getMoveChart(),
        });
      })

      // Upload team logo
      .patch("/logo", {
        auth: jwtCheck,
        middleware: [rolecheck("coach")],
        handler: async (req: Request, res: Response, ctx) => {
          const { logo } = req.body;

          if (!logo) {
            throw new PDZError(ErrorCodes.BAD_REQUEST, {
              message: "Logo data required",
            });
          }

          const logoUrl = await s3Service.uploadTeamLogo(
            ctx.league.leagueKey,
            ctx.team._id.toString(),
            logo,
          );

          ctx.team.logo = logoUrl;
          await ctx.team.save();

          res.json({ success: true, logo: logoUrl });
        },
      })
  );
}
