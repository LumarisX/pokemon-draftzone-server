import { Request, Response } from "express";
import { createRoute } from "./route-builder-v2";
import {
  LeagueContext,
  DivisionContext,
  TeamContext,
  withLeagueByKey,
  withDivision,
  withTeam,
  withTeamOnly,
} from "./contexts";
import { rolecheck } from "../../middleware/rolecheck";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import { jwtCheck } from "../../middleware/jwtcheck";
import * as draftService from "../../services/league-services/draft-service";

/**
 * Real-world league routes using the new route builder
 * This replaces the old league.route.ts structure
 */
export const LeagueRoutes = createRoute()
  // ============================================================================
  // AD LIST ROUTES (No league context needed)
  // ============================================================================

  .get("/ad-list", async (req: Request, res: Response) => {
    // Return all league ads
    res.json([]);
  })

  .scope({ auth: jwtCheck }, (auth) => {
    auth.get("/ad-list/manage", async (req: Request, res: Response) => {
      // Return user's ads
      const userId = req.auth?.payload?.sub;
      res.json([]);
    });

    auth.post("/ad-list/manage", async (req: Request, res: Response) => {
      const { title, description, contact } = req.body;
      // Create new ad
      res.json({ success: true, id: "new-ad-id" });
    });

    auth.delete(
      "/ad-list/manage/:ad_id",
      async (req: Request, res: Response) => {
        const { ad_id } = req.params;
        // Delete ad
        res.json({ success: true });
      },
    );
  })

  // ============================================================================
  // LEAGUE-SPECIFIC ROUTES (/:league_key)
  // ============================================================================

  .scope(
    {
      path: "/:league_key",
      load: withLeagueByKey,
    },
    (league) => {
      // ------------------------------------------------------------------------
      // Public League Routes
      // ------------------------------------------------------------------------

      league.get(
        "/info",
        async (req: Request, res: Response, ctx: LeagueContext) => {
          // Populate divisions
          await ctx.league.populate<{ divisions: LeagueDivisionDocument[] }>(
            "divisions",
            ["divisionKey", "name"],
          );

          // Format division information
          const divisions = (
            ctx.league.divisions as LeagueDivisionDocument[]
          ).map((div) => ({
            divisionKey: div.divisionKey,
            name: div.name,
          }));

          res.json({
            name: ctx.league.name,
            leagueKey: ctx.league.leagueKey,
            description: ctx.league.description,
            format: ctx.league.format,
            ruleset: ctx.league.ruleset,
            signUpDeadline: ctx.league.signUpDeadline,
            draftStart: ctx.league.draftStart,
            draftEnd: ctx.league.draftEnd,
            seasonStart: ctx.league.seasonStart,
            seasonEnd: ctx.league.seasonEnd,
            logo: ctx.league.logo,
            divisions,
            discord: ctx.league.discord,
          });
        },
      );

      league.get(
        "/rules",
        async (req: Request, res: Response, ctx: LeagueContext) => {
          res.json(ctx.league.rules);
        },
      );

      league.get(
        "/tier-list",
        async (req: Request, res: Response, ctx: LeagueContext) => {
          await ctx.league.populate("tierList");
          res.json(ctx.league.tierList);
        },
      );

      league.get(
        "/schedule",
        async (req: Request, res: Response, ctx: LeagueContext) => {
          // Get full league schedule across all divisions
          res.json({ schedule: [] });
        },
      );

      // ------------------------------------------------------------------------
      // Authenticated League Routes
      // ------------------------------------------------------------------------

      league.scope({ auth: jwtCheck }, (auth) => {
        auth.get(
          "/roles",
          async (req: Request, res: Response, ctx: LeagueContext) => {
            const userId = req.auth?.payload?.sub;
            // Get user's roles in this league
            res.json({ roles: [] });
          },
        );

        auth.get(
          "/signup",
          async (req: Request, res: Response, ctx: LeagueContext) => {
            // Get signup form/status
            res.json({
              leagueKey: ctx.league.leagueKey,
              signUpDeadline: ctx.league.signUpDeadline,
            });
          },
        );

        auth.post(
          "/signup",
          async (req: Request, res: Response, ctx: LeagueContext) => {
            const { teamName, preferredDivision } = req.body;
            // Process signup
            res.json({ success: true });
          },
        );

        // ------------------------------------------------------------------
        // Admin/Organizer Only Routes (nested auth scope)
        // ------------------------------------------------------------------

        auth.scope({ auth: rolecheck("organizer") }, (admin) => {
          admin.get(
            "/tier-list/edit",
            async (req: Request, res: Response, ctx: LeagueContext) => {
              await ctx.league.populate("tierList");
              res.json(ctx.league.tierList);
            },
          );

          admin.post(
            "/tier-list/edit",
            async (req: Request, res: Response, ctx: LeagueContext) => {
              const { tiers, pokemon } = req.body;
              // Update tier list
              res.json({ success: true });
            },
          );
        });
      });

      // ------------------------------------------------------------------------
      // Team Routes (/:league_key/teams/:team_id)
      // ------------------------------------------------------------------------

      league.scope(
        {
          path: "/teams/:team_id",
          load: withTeamOnly,
        },
        (team) => {
          team.get(
            "/",
            async (
              req: Request,
              res: Response,
              ctx: LeagueContext & { team: any },
            ) => {
              // Return full team data
              res.json({
                team: ctx.team,
                league: ctx.league.leagueKey,
              });
            },
          );
        },
      );

      // ------------------------------------------------------------------------
      // Division Routes (/:league_key/divisions/:division_id)
      // ------------------------------------------------------------------------

      league.scope(
        {
          path: "/divisions/:division_id",
          load: withDivision,
        },
        (division) => {
          // --------------------------------------------------------------------
          // Public Division Routes
          // --------------------------------------------------------------------

          division.get(
            "/",
            async (req: Request, res: Response, ctx: DivisionContext) => {
              res.json(ctx.division);
            },
          );

          division.get(
            "/schedule",
            async (req: Request, res: Response, ctx: DivisionContext) => {
              // Get division schedule
              res.json({ schedule: [] });
            },
          );

          division.get(
            "/standings",
            async (req: Request, res: Response, ctx: DivisionContext) => {
              // Get division standings
              res.json({ standings: [] });
            },
          );

          division.get(
            "/order",
            async (req: Request, res: Response, ctx: DivisionContext) => {
              // Get draft order
              res.json({ draftOrder: [] });
            },
          );

          // --------------------------------------------------------------------
          // Authenticated Division Routes
          // --------------------------------------------------------------------

          division.scope({ auth: jwtCheck }, (auth) => {
            auth.get(
              "/picks",
              async (req: Request, res: Response, ctx: DivisionContext) => {
                // Get all picks in the division
                res.json({ picks: [] });
              },
            );

            auth.get(
              "/power-rankings",
              async (req: Request, res: Response, ctx: DivisionContext) => {
                // Get power rankings
                res.json({ rankings: [] });
              },
            );
          });

          // --------------------------------------------------------------------
          // Division Management Routes (/:league_key/manage/divisions/:division_id)
          // This could also be a separate scope at league level
          // --------------------------------------------------------------------

          division.scope(
            {
              path: "/manage",
              auth: [jwtCheck, rolecheck("organizer")],
            },
            (manage) => {
              manage.post(
                "/state",
                async (req: Request, res: Response, ctx: DivisionContext) => {
                  const { state } = req.body;
                  // Set draft state (active, paused, etc.)
                  res.json({ success: true });
                },
              );

              manage.post(
                "/skip",
                async (req: Request, res: Response, ctx: DivisionContext) => {
                  await draftService.skipCurrentPick(ctx.league, ctx.division);
                  res.json({ success: true });
                },
              );

              manage.post(
                "/setdraft",
                async (req: Request, res: Response, ctx: DivisionContext) => {
                  const { teamId, pickNumber } = req.body;
                  // Set specific draft pick
                  res.json({ success: true });
                },
              );
            },
          );

          // --------------------------------------------------------------------
          // Team Routes (/:league_key/divisions/:division_id/teams/:team_id)
          // --------------------------------------------------------------------

          division.scope(
            {
              path: "/teams/:team_id",
              load: withTeam,
              auth: jwtCheck,
            },
            (team) => {
              team.post(
                "/draft",
                async (req: Request, res: Response, ctx: TeamContext) => {
                  const { pokemon, teraType } = req.body;

                  await draftService.draftPokemon({
                    divisionId: ctx.division._id.toString(),
                    teamId: ctx.team._id.toString(),
                    pokemon,
                    teraType,
                  });

                  res.json({ success: true });
                },
              );

              team.post(
                "/picks",
                async (req: Request, res: Response, ctx: TeamContext) => {
                  const { picks } = req.body;
                  // Update team's pick preferences
                  res.json({ success: true });
                },
              );
            },
          );
        },
      );
    },
  )

  .build();

// ============================================================================
// ALTERNATIVE: Separate Management Routes
// ============================================================================

/**
 * You could also split management routes into a separate scope
 * at the league level for better organization:
 */
export const LeagueManagementRoutes = createRoute("/:league_key")
  .load(withLeagueByKey)
  .scope({ auth: [jwtCheck, rolecheck("organizer")] }, (admin) => {
    admin.scope(
      {
        path: "/manage/divisions/:division_id",
        load: withDivision,
      },
      (division) => {
        division.post(
          "/state",
          async (req: Request, res: Response, ctx: DivisionContext) => {
            res.json({ success: true });
          },
        );

        division.post(
          "/skip",
          async (req: Request, res: Response, ctx: DivisionContext) => {
            await draftService.skipCurrentPick(ctx.league, ctx.division);
            res.json({ success: true });
          },
        );

        division.post(
          "/setdraft",
          async (req: Request, res: Response, ctx: DivisionContext) => {
            res.json({ success: true });
          },
        );
      },
    );
  })
  .build();
