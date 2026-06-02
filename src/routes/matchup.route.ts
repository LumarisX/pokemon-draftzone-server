import mongoose from "mongoose";
import z from "zod";
import { Matchup, type PopulatedLeagueMatchup } from "../classes/matchup";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import LeagueDivisionModel from "../models/league/division.model";
import {
  LeagueMatchupModel,
  type MatchSide,
} from "../models/league/matchup.model";
import LeagueTeamModel from "../models/league/team.model";
import LeagueTournamentModel from "../models/league/tournament.model";
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
import { LeagueTierListDocument } from "../models/league/tier-list.model";

/** Derives the winner side from a match document, using the explicit winner or counting results. */
function deriveWinnerSide(
  match: InstanceType<typeof LeagueMatchupModel>,
): "side1" | "side2" | null {
  if (match.winner && match.winner !== "draw") {
    return match.winner as "side1" | "side2";
  }
  if (match.results?.length > 0) {
    const s1 = match.results.filter((r) => r.winner === "side1").length;
    const s2 = match.results.filter((r) => r.winner === "side2").length;
    if (s1 > s2) return "side1";
    if (s2 > s1) return "side2";
  }
  return null;
}

/** Recursively resolves the team for a bracket side by following the slot chain. */
async function resolveSlotTeam(side: MatchSide, depth = 0): Promise<any> {
  if (side.team) return side.team;
  if (!side.slot || side.slot.type === "seed" || depth > 8) return null;
  const { matchId, type } = side.slot as {
    type: "winner" | "loser";
    matchId: string;
  };
  if (!matchId) return null;

  const previousMatch = await LeagueMatchupModel.findById(matchId);
  if (!previousMatch) return null;

  const winnerSide = deriveWinnerSide(previousMatch);
  if (!winnerSide) return null;

  const resolvedSide: "side1" | "side2" =
    type === "winner" ? winnerSide : winnerSide === "side1" ? "side2" : "side1";

  // If the resolved side has a team, return it populated
  if (previousMatch[resolvedSide].team) {
    return LeagueTeamModel.findById(previousMatch[resolvedSide].team).populate<{
      coach: { teamName: string; name: string; auth0Id: string };
    }>("coach");
  }

  // Otherwise follow the chain recursively
  return resolveSlotTeam(previousMatch[resolvedSide], depth + 1);
}

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
        ).populate<PopulatedLeagueMatchup>([
          {
            path: "side1.team",
            populate: { path: "coach" },
          },
          {
            path: "side2.team",
            populate: { path: "coach" },
          },
          {
            path: "division",
            populate: {
              path: "tournament",
              populate: {
                path: "tierList",
              },
            },
          },
        ]);

        if (!leagueMatchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);

        if (!leagueMatchup.division) {
          // Bracket matchup: no division on the document — resolve tournament + per-team divisions
          const tournament = await LeagueTournamentModel.findOne({
            "stages.rounds._id": leagueMatchup.round,
          }).populate<{
            tierList: LeagueTierListDocument;
          }>("tierList");
          if (!tournament) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);

          // Resolve teams: use populated team if present, otherwise look up previous match winner
          const [side1Team, side2Team] = await Promise.all([
            leagueMatchup.side1.team
              ? Promise.resolve(leagueMatchup.side1.team as any)
              : resolveSlotTeam(leagueMatchup.side1),
            leagueMatchup.side2.team
              ? Promise.resolve(leagueMatchup.side2.team as any)
              : resolveSlotTeam(leagueMatchup.side2),
          ]);

          const [side1Division, side2Division] = await Promise.all([
            side1Team
              ? LeagueDivisionModel.findOne({
                  teams: side1Team._id,
                  tournament: tournament._id,
                })
              : Promise.resolve(null),
            side2Team
              ? LeagueDivisionModel.findOne({
                  teams: side2Team._id,
                  tournament: tournament._id,
                })
              : Promise.resolve(null),
          ]);

          // Build a plain object merging the matchup with the resolved teams
          const matchupWithTeams = {
            ...leagueMatchup.toObject(),
            side1: { ...leagueMatchup.toObject().side1, team: side1Team },
            side2: { ...leagueMatchup.toObject().side2, team: side2Team },
            division: null,
          };

          matchup = Matchup.fromLeagueBracketMatchup(
            matchupWithTeams as any,
            tournament,
            side1Division,
            side2Division,
          );
        } else {
          matchup = Matchup.fromLeagueMatchup(leagueMatchup);
        }
      }

      return { rawMatchup, matchup, matchup_id };
    },
  })((r) => {
    r.get.auth()(async (ctx) => {
      if (
        ctx.sub !== ctx.matchup.aTeam.owner &&
        ctx.sub !== ctx.matchup.bTeam.owner
      )
        throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
      return await ctx.matchup.analyze(ctx.sub);
    });
    r.delete(async (ctx) => {
      await deleteMatchup(ctx.matchup_id);
      return { message: "Matchup deleted" };
    });
    r.path("shared")((r) => {
      r.get(async (ctx) => await ctx.matchup.analyze());
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
