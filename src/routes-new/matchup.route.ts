import mongoose from "mongoose";
import z from "zod";
import { Matchup } from "../classes/matchup";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { LeagueCoachDocument } from "../models/league/coach.model";
import {
  LeagueDivision,
  LeagueDivisionDocument,
  LeagueStageDocument,
} from "../models/league/division.model";
import { LeagueMatchupModel } from "../models/league/matchup.model";
import { LeagueTeamDocument } from "../models/league/team.model";
import { LeagueTournamentDocument } from "../models/league/tournament.model";
import { getDraft } from "../services/database-services/draft.service";
import {
  deleteMatchup,
  getMatchupByIdNew,
} from "../services/database-services/matchup.service";
import { coveragechart } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { speedchart } from "../services/matchup-services/speedchart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { createRoute } from "./route-builder";

export const MatchupRoute = createRoute()((r) => {
  r.path("quick")((r) => {
    r.post.validate({
      //TODO: refine this schema
      body: (data) => z.any().parse(data),
    })(
      async (ctx) =>
        await (await Matchup.fromQuickData(ctx.validatedBody)).analyze(),
    );
  });
  r.param("matchup_id", {
    validate: (matchup_id) => mongoose.Types.ObjectId.isValid(matchup_id),
    loader: async (ctx, matchup_id) => {
      const rawMatchup = await getMatchupByIdNew(matchup_id);
      let matchup: Matchup | null = null;
      if (rawMatchup) {
        matchup = await Matchup.fromData(rawMatchup);
      } else {
        const leagueMatchup = await LeagueMatchupModel.findById(
          matchup_id,
        ).populate<{
          team1: LeagueTeamDocument & { coach: LeagueCoachDocument };
          team2: LeagueTeamDocument & { coach: LeagueCoachDocument };
          stage: LeagueStageDocument;
          division: LeagueDivisionDocument & {
            tournament: LeagueTournamentDocument;
          };
        }>([
          {
            path: "team1",
            populate: { path: "coach" },
          },
          {
            path: "team2",
            populate: { path: "coach" },
          },
          {
            path: "division",

            populate: {
              path: "tournament",
            },
          },
          { path: "stage" },
        ]);

        if (!leagueMatchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
        matchup = Matchup.fromLeagueMatchup(leagueMatchup);
      }

      return { rawMatchup, matchup, matchup_id };
    },
  })((r) => {
    r.get(async (ctx) => await ctx.matchup.analyze());
    r.delete(async (ctx) => {
      await deleteMatchup(ctx.matchup_id);
      return { message: "Matchup deleted" };
    });
    r.path("summary")((r) => {
      r.get(async (ctx) => {
        const aTeamsummary = new SummaryClass(
          ctx.matchup.aTeam.team,
          ctx.matchup.aTeam.teamName,
        );
        const bTeamsummary = new SummaryClass(
          ctx.matchup.bTeam.team,
          ctx.matchup.bTeam.teamName,
        );
        return [aTeamsummary.toJson(), bTeamsummary.toJson()];
      });
    });
    r.path("typechart")((r) => {
      r.get(async (ctx) => [
        new Typechart(ctx.matchup.aTeam.team).toJson(),
        new Typechart(ctx.matchup.bTeam.team).toJson(),
      ]);
    });
    r.path("speedchart")((r) => {
      r.get(async (ctx) =>
        speedchart(
          [ctx.matchup.aTeam.team, ctx.matchup.bTeam.team],
          ctx.matchup.format.level,
        ),
      );
    });
    r.path("coveragechart")((r) => {
      r.get(async (ctx) => [
        coveragechart(ctx.matchup.aTeam.team, ctx.matchup.bTeam.team),
        coveragechart(ctx.matchup.bTeam.team, ctx.matchup.aTeam.team),
      ]);
    });
    r.path("movechart")((r) => {
      r.get(
        async (ctx) =>
          await Promise.all([
            movechart(ctx.matchup.aTeam.team, ctx.matchup.ruleset),
            movechart(ctx.matchup.bTeam.team, ctx.matchup.ruleset),
          ]),
      );
    });
    r.path("notes")((r) => {
      r.get(async (ctx) => ({ notes: ctx.rawMatchup?.notes || "" }));
    });
    r.path("update-notes")((r) => {
      r.post.auth().validate({
        body: (data) => z.object({ notes: z.string() }).parse(data),
      })(async (ctx) => {
        //TODO: remove !
        const matchupDoc = ctx.rawMatchup!;
        const aTeamDraft = await getDraft(matchupDoc.aTeam._id);
        const ownerSub = aTeamDraft.owner;
        if (ctx.sub !== ownerSub) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
        const { notes } = ctx.validatedBody;
        matchupDoc.notes = notes;
        await matchupDoc.save();
        return { success: true };
      });
    });
  });
});
