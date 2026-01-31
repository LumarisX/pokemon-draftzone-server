import { createRoute } from "./route-builder-v2";
import { withLeagueByKey, withDivision, withTeamOnly } from "./contexts";
import { addAdListRoutes } from "./ad-list.routes";
import { addLeagueInfoRoutes } from "./league-info.routes";
import { addDivisionRoutes } from "./division.routes";
import { addTeamRoutes } from "./team.routes";

/**
 * Main league routes composition using modular pattern
 *
 * This file demonstrates the composable function pattern where each
 * route module is a pure function that accepts and returns a RouteBuilder.
 */
export const LeagueRoutes = createRoute()
  // Add ad-list routes (no context needed)
  .pipe(addAdListRoutes)

  // League-specific routes with context
  .scope({ path: "/:league_key", load: withLeagueByKey }, (league) => {
    // Add all league info routes
    addLeagueInfoRoutes(league);

    // Division routes
    league.scope(
      {
        path: "/divisions/:division_id",
        load: withDivision,
      },
      (division) => {
        addDivisionRoutes(division);
      },
    );

    // Direct team routes (no division context)
    league.scope(
      {
        path: "/teams/:team_id",
        load: withTeamOnly,
      },
      (team) => {
        addTeamRoutes(team);
      },
    );
  })

  .build();
