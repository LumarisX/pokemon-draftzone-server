import { Request, Response } from "express";
import { RouteOld } from ".";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { plannerCoverage } from "../services/matchup-services/coverage.service";
import { createRoute } from "./route-builder";
import z from "zod";
import { PDZError } from "../errors/pdz-error";
import { ErrorCodes } from "../errors/error-codes";
import { ID } from "@pkmn/data";

export const PlannerRoutes: RouteOld = {
  subpaths: {
    "/": {
      get: async (req: Request, res: Response) => {
        try {
          let team: DraftSpecie[] = [];
          let ruleset = getRuleset(
            typeof req.query.ruleset === "string" ? req.query.ruleset : "",
          );
          if (
            req.query &&
            req.query.team &&
            typeof req.query.team == "string"
          ) {
            team = req.query.team.split(",").map((id: string) => {
              let specie = ruleset.dex.species.get(id);
              if (!specie) throw new Error(`${id} is an unknown id.`);
              let draftSpecies: DraftSpecie = new DraftSpecie(specie, ruleset);
              return draftSpecies;
            });
            let typechart = new Typechart(team);
            let summary = new SummaryClass(team);
            res.json({
              typechart: typechart.toJson(),
              recommended: typechart.recommended(),
              summary: summary.toJson(),
              movechart: await movechart(team, ruleset),
              coverage: await plannerCoverage(team),
            });
          }
        } catch (error) {
          console.log(error);
          res.status(500).json({ message: (error as Error).message });
        }
      },
      ws: (socket, message) => {
        console.log(JSON.parse(message), "HELLOF WOLRD");
      },
    },
  },
};

export const PlannerRoute = createRoute()((r) => {
  r.get.validate({
    query: (data) =>
      z
        .object({
          ruleset: z.string().min(1),
          team: z.string(),
        })
        .parse(data),
  })(async (ctx) => {
    const ruleset = getRuleset(ctx.validatedQuery.ruleset);
    const team = ctx.validatedQuery.team
      .split(",")
      .map((id: string) => new DraftSpecie(id as ID, ruleset));
    const typechart = new Typechart(team);
    const summary = new SummaryClass(team);
    return {
      typechart: typechart.toJson(),
      recommended: typechart.recommended(),
      summary: summary.toJson(),
      movechart: await movechart(team, ruleset),
      coverage: await plannerCoverage(team),
    };
  });
});
