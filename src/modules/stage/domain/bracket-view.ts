import { Types } from "mongoose";
import { StageDocument } from "../stage.schema";

interface BracketTeamDoc {
  _id: Types.ObjectId;
  teamName: string;
  logo?: string;
  coach: { name: string };
}

interface BracketSlotDoc {
  type: "seed" | "winner" | "loser";
  seed?: number;
  matchId?: string;
}

interface BracketMatchupDoc {
  _id: Types.ObjectId;
  round?: Types.ObjectId | null;
  section?: string;
  bracketRound?: number;
  position?: number;
  label?: string;
  side1: { slot?: BracketSlotDoc };
  side2: { slot?: BracketSlotDoc };
  winner?: string;
  results?: { replay?: string }[];
}

function mapSlot(slot: BracketSlotDoc | undefined) {
  if (!slot) return null;
  return slot.type === "seed"
    ? { type: slot.type, seed: slot.seed }
    : { type: slot.type, from: slot.matchId };
}

export function buildBracketView(
  stage: StageDocument,
  matchups: BracketMatchupDoc[],
  teamDocs: BracketTeamDoc[],
) {
  const teamObjIds = stage.pools.flatMap((pool) => pool.teamIds);
  const teams = teamObjIds
    .map((teamId, idx) => {
      const teamDoc = teamDocs.find(
        (t) => t._id.toString() === teamId.toString(),
      );
      if (!teamDoc) return null;
      return {
        seed: idx + 1,
        teamName: teamDoc.teamName,
        coachName: teamDoc.coach.name,
        logo: teamDoc.logo,
        teamId: teamDoc._id.toString(),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const roundIdToName = new Map(
    stage.rounds.map((round) => [round._id.toString(), round.name]),
  );

  const latestSeeding = stage.seedingLog[stage.seedingLog.length - 1];

  return {
    format: stage.type,
    seeding: latestSeeding
      ? {
          method: latestSeeding.method,
          seededAt: latestSeeding.seededAt,
          inputTeamsHash: latestSeeding.inputTeamsHash ?? null,
          algorithmVersion: latestSeeding.algorithmVersion ?? null,
          timesSeeded: stage.seedingLog.length,
        }
      : null,
    teams,
    rounds: stage.rounds.map((round) => ({
      _id: round._id.toString(),
      name: round.name,
      matchDeadline: round.matchDeadline ?? null,
    })),
    matches: matchups.map((matchup) => ({
      _id: matchup._id.toString(),
      round: matchup.round?.toString() ?? null,
      roundName: matchup.round
        ? (roundIdToName.get(matchup.round.toString()) ?? null)
        : null,
      section: matchup.section ?? null,
      bracketRound: matchup.bracketRound ?? null,
      position: matchup.position ?? null,
      label: matchup.label ?? null,
      a: mapSlot(matchup.side1.slot),
      b: mapSlot(matchup.side2.slot),
      winner:
        matchup.winner === "side1"
          ? 0
          : matchup.winner === "side2"
            ? 1
            : undefined,
      replay: matchup.results?.[0]?.replay,
    })),
  };
}
