import {
  DraftDocument,
  DraftEntity,
  DraftSchema,
} from "@modules/draft/draft.schema";
import {
  LeagueMatchupDocument,
  LeagueMatchupEntity,
  LeagueMatchupSchema,
} from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import {
  StageDocument,
  StageEntity,
  StageSchema,
} from "@modules/stage/stage.schema";
import {
  CoachDocument,
  CoachEntity,
  CoachSchema,
} from "@modules/coach/coach.schema";
import { PopulatedTeam } from "@modules/team/team.repository";
import { TeamDocument, TeamEntity, TeamSchema } from "@modules/team/team.schema";
import {
  HostedTournamentDocument,
  HostedTournamentEntity,
  HostedTournamentSchema,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { LeagueDocument } from "@modules/league/league.schema";
import mongoose from "mongoose";
import { findDiscordMemberInIndex, getDiscordMemberIndex } from "../../discord";
import { LeagueCoachDocument } from "../../models/league/coach.model";
import { LeagueTeamDocument } from "../../models/league/team.model";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";
import { getRosterByRound } from "./roster-service";
import { calculateTeamScore } from "./standings-service";

// Plain Mongoose model lookups (not Nest-DI) — this file is a free-function
// service module, not a Nest-managed class, so it can't take repositories
// via constructor injection. Resolves against whatever model Nest already
// registered on the default connection; falls back to registering directly
// if this module loads before Nest does (mirrors draft-service.ts/agenda.ts).
function resolveModel<T>(
  name: string,
  schema: mongoose.Schema,
): mongoose.Model<T> {
  return (
    (mongoose.models[name] as mongoose.Model<T>) ??
    (mongoose.model(name, schema) as unknown as mongoose.Model<T>)
  );
}

const CoachMongooseModel = resolveModel<CoachDocument>(
  CoachEntity.name,
  CoachSchema,
);
const TeamMongooseModel = resolveModel<TeamDocument>(
  TeamEntity.name,
  TeamSchema,
);
const DraftMongooseModel = resolveModel<DraftDocument>(
  DraftEntity.name,
  DraftSchema,
);
const StageMongooseModel = resolveModel<StageDocument>(
  StageEntity.name,
  StageSchema,
);
const LeagueMatchupMongooseModel = resolveModel<LeagueMatchupDocument>(
  LeagueMatchupEntity.name,
  LeagueMatchupSchema,
);
const HostedTournamentMongooseModel = resolveModel<HostedTournamentDocument>(
  HostedTournamentEntity.name,
  HostedTournamentSchema,
);

export async function getRoles(
  tournament: LeagueTournamentDocument,
  sub: string | undefined,
): Promise<string[]> {
  if (!sub) return [];
  const roles: string[] = [];
  const isOwner = tournament.owner === sub;
  if (isOwner) roles.push("owner");
  const isOrganizer = tournament.organizers.includes(sub);
  if (isOrganizer || isOwner) roles.push("organizer");
  return roles;
}

type TournamentByOwnerEntry = {
  name: string;
  teamName: string;
  tournamentName: string;
  logo?: string;
  discord?: string;
  tournamentKey: string;
  leagueName?: string;
  leagueKey?: string;
  draftKey: string;
  teamId: string;
  draft: { id: string }[];
  score?: { wins: number; losses: number; diff: number };
};

/**
 * Resolves a team's win/loss/diff score for whatever Stage currently groups
 * it within the given tournament. Returns undefined (not zeros) if the team
 * isn't grouped into any Stage yet — pre-draft or draft-only tournaments
 * have no Stage to score against.
 */
async function resolveTeamScore(
  tournament: Pick<HostedTournamentDocument, "_id" | "forfeit">,
  team: PopulatedTeam,
): Promise<{
  stage: StageDocument | null;
  score: { wins: number; losses: number; diff: number } | undefined;
}> {
  const stage = await StageMongooseModel.findOne({
    tournamentId: tournament._id,
    "pools.teamIds": team._id,
  }).exec();

  if (!stage) return { stage: null, score: undefined };

  const matchups = (await LeagueMatchupMongooseModel.find({
    stage: stage._id,
    $or: [{ "side1.team": team._id }, { "side2.team": team._id }],
  })
    .populate([
      { path: "side1.team", populate: "coach" },
      { path: "side2.team", populate: "coach" },
    ])
    .exec()) as unknown as (LeagueMatchupDocument & {
    side1: { team: PopulatedTeam };
    side2: { team: PopulatedTeam };
  })[];

  const teamScore = await calculateTeamScore(
    matchups,
    stage.rounds,
    team,
    tournament.forfeit,
  );

  return {
    stage,
    score: {
      wins: teamScore.wins,
      losses: teamScore.losses,
      diff:
        teamScore.diffMode === "game"
          ? teamScore.gameDiff
          : teamScore.pokemonDiff,
    },
  };
}

/**
 * Resolves every tournament a user (by auth0Id) is signed up for, via their
 * Coach(es) -> Team(s). Rosters resolve via the new Team/Draft collections;
 * scores resolve via whatever Stage (if any) currently groups that team —
 * a team with no Stage yet (pre-draft, or a draft-only tournament) simply
 * gets no score field instead of erroring.
 */
export async function getTournamentsByOwner(
  auth0Id: string,
): Promise<TournamentByOwnerEntry[]> {
  const coaches = await CoachMongooseModel.find({ auth0Id }).exec();
  if (coaches.length === 0) return [];

  const teamIds = coaches.map((coach) => coach.teamId);
  const teams = (await TeamMongooseModel.find({ _id: { $in: teamIds } })
    .populate<{ coach: CoachDocument }>("coach")
    .exec()) as unknown as PopulatedTeam[];

  const publicTeams = teams.filter((team) => team.draftId);
  if (publicTeams.length === 0) return [];

  const draftIds = [
    ...new Set(publicTeams.map((team) => team.draftId!.toString())),
  ];
  const drafts = await DraftMongooseModel.find({
    _id: { $in: draftIds },
    public: true,
  })
    .sort({ createdAt: -1 })
    .exec();

  const tournamentMap = new Map<string, TournamentByOwnerEntry>();

  for (const draft of drafts) {
    const tournamentIdString = draft.tournamentId.toString();
    if (tournamentMap.has(tournamentIdString)) continue;

    const userTeam = publicTeams.find(
      (team) => team.draftId?.toString() === draft._id.toString(),
    );
    if (!userTeam) continue;

    const coach = coaches.find(
      (c) => c._id.toString() === userTeam.coach._id.toString(),
    );
    if (!coach) continue;

    const tournament = await HostedTournamentMongooseModel.findById(
      draft.tournamentId,
    )
      .populate<{ league: LeagueDocument }>("league")
      .exec();
    if (!tournament) continue;

    const { stage, score } = await resolveTeamScore(tournament, userTeam);

    tournamentMap.set(tournamentIdString, {
      name: coach.name,
      teamName: userTeam.teamName,
      tournamentName: tournament.name,
      logo: tournament.logo,
      discord: tournament.discord,
      tournamentKey: tournament.tournamentKey,
      leagueName: tournament.league?.name,
      leagueKey: tournament.league?.leagueKey,
      draftKey: draft.draftKey,
      teamId: userTeam._id.toString(),
      draft: getRosterByRound(userTeam, stage ?? undefined).map((pokemon) => ({
        id: pokemon.id,
      })),
      ...(score ? { score } : {}),
    });
  }

  return Array.from(tournamentMap.values());
}

const DISCORD_GUILD_ID = "1183936734719922176";

export async function checkDiscordMembership(
  userIds: string[],
): Promise<{ query: string; joined: boolean }[]> {
  const memberIndex = await getDiscordMemberIndex(DISCORD_GUILD_ID);
  return userIds.map((userId) => ({
    query: userId,
    joined: Boolean(
      memberIndex ? findDiscordMemberInIndex(memberIndex, userId) : null,
    ),
  }));
}

export function getTeamClient(
  team: LeagueTeamDocument & { coach: LeagueCoachDocument },
) {
  return {
    id: team._id,
    name: team.teamName,
    coach: team.coach.name,
    logo: team.logo,
  };
}
