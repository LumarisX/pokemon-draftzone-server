import { getName } from "@modules/data/domain/pokedex";
import {
  PopulatedDraft,
  PopulatedTeam,
} from "@modules/draft/draft.repository";
import { PickLogEntity } from "@modules/team/team.schema";
import mongoose from "mongoose";

export function getPokemonIdFromDraft(pick: PickLogEntity): string {
  return pick.pokemon.id;
}

export function getDocumentId(
  value: mongoose.Types.ObjectId | { _id: mongoose.Types.ObjectId },
): string {
  return value instanceof mongoose.Types.ObjectId
    ? value.toString()
    : value._id.toString();
}

export type DraftPick = {
  teamName: string;
  pokemon?: { id: string; name: string };
};

export type DraftRound = DraftPick[];

export function getDraftOrder(draft: PopulatedDraft): PopulatedTeam[] {
  if (draft.teams.length <= 1 || !draft.useRandomSeeding) return draft.teams;

  let seed = 0;
  const draftId = draft._id.toString();
  for (let i = 0; i < draftId.length; i++) {
    seed = (seed << 5) - seed + draftId.charCodeAt(i);
    seed = seed & seed;
  }
  const seededRandom = (index: number) => {
    const x = Math.sin((seed + index) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const shuffled = [...draft.teams];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Generates the full pick order for a draft.
 * @param initialTeamOrder - The initial order of teams.
 * @param numberOfRounds - The total number of rounds in the draft.
 * @param orderProgression - The style of the draft ('snake' or 'linear').
 * @returns An array of PopulatedTeam representing the pick order.
 */
export function generatePickOrder(
  initialTeamOrder: PopulatedTeam[],
  numberOfRounds: number,
  orderProgression: "snake" | "linear",
): PopulatedTeam[] {
  const pickOrder: PopulatedTeam[] = [];
  for (let r = 0; r < numberOfRounds; r++) {
    let currentRoundOrder = [...initialTeamOrder];
    if (orderProgression === "snake" && r % 2 === 1) {
      currentRoundOrder.reverse();
    }
    pickOrder.push(...currentRoundOrder);
  }
  return pickOrder;
}

/**
 * Builds the draft board, both as a flat list and structured into rounds.
 * @param draft - The draft document.
 * @param pickOrder - The generated pick order.
 * @returns An object containing the flat draft board and the draft rounds.
 */
export async function buildDraftBoards(
  draft: PopulatedDraft,
  pickOrder: PopulatedTeam[],
): Promise<{ flatDraftBoard: DraftPick[]; draftRounds: DraftRound[] }> {
  const initialTeamOrder = getDraftOrder(draft);
  const teamDraftCursors = new Map<string, number>();
  initialTeamOrder.forEach((t) => teamDraftCursors.set(t._id.toString(), 0));

  const flatDraftBoard: DraftPick[] = [];
  for (let i = 0; i < pickOrder.length; i++) {
    const team = pickOrder[i];
    const draftPick: DraftPick = {
      teamName: team.teamName,
    };

    const teamId = team._id.toString();
    const cursor = teamDraftCursors.get(teamId)!;
    if (team.pickLog[cursor]) {
      const pokemonId = getPokemonIdFromDraft(team.pickLog[cursor]);
      draftPick.pokemon = {
        id: pokemonId,
        name: getName(pokemonId),
      };
      teamDraftCursors.set(teamId, cursor + 1);
    }

    flatDraftBoard.push(draftPick);
  }

  const draftRounds: DraftRound[] = [];
  const teamsCount = initialTeamOrder.length;
  const numberOfRounds = pickOrder.length / teamsCount;
  for (let i = 0; i < numberOfRounds; i++) {
    draftRounds.push(
      flatDraftBoard.slice(i * teamsCount, (i + 1) * teamsCount),
    );
  }

  return { flatDraftBoard, draftRounds };
}

/**
 * Determines which teams are eligible to make a draft pick.
 * @param draft - The draft document.
 * @param pickOrder - The generated pick order.
 * @returns An array of team IDs that are eligible to draft.
 */
export function calculateCanDraft(
  draft: PopulatedDraft,
  pickOrder: PopulatedTeam[],
): string[] {
  const canDraft: string[] = [];
  if (draft.status !== "IN_PROGRESS") return canDraft;

  if (!draft.sequentialTurns) return pickOrder.map((t) => t._id.toString());

  if (draft.orderProgression === "snake") {
    const initialTeamOrder = getDraftOrder(draft);
    if (!initialTeamOrder || initialTeamOrder.length === 0) return canDraft;

    const picksExpected = new Map<string, number>();
    const counterLimit = Math.min(draft.counter, pickOrder.length);
    for (let i = 0; i < counterLimit; i++) {
      if (i >= pickOrder.length) break;
      const teamId = pickOrder[i]._id.toString();
      picksExpected.set(teamId, (picksExpected.get(teamId) || 0) + 1);
    }

    for (const team of initialTeamOrder) {
      const teamId = team._id.toString();
      const expected = picksExpected.get(teamId) || 0;
      if (team.pickLog.length < expected) {
        canDraft.push(teamId);
      }
    }

    if (draft.counter < pickOrder.length) {
      const currentPickingTeamId = pickOrder[draft.counter]._id.toString();
      if (!canDraft.includes(currentPickingTeamId)) {
        canDraft.push(currentPickingTeamId);
      }
    }
    return canDraft;
  }

  // Todo: Add support for linear draft

  return canDraft;
}

/**
 * Calculates the current pick number and round.
 * @param draft - The draft document.
 * @returns An object with the current round and position.
 */
export function calculateCurrentPick(draft: PopulatedDraft) {
  return {
    round: Math.floor(draft.counter / draft.teams.length),
    position: draft.counter % draft.teams.length,
    skipTime: draft.skipTime,
  };
}

export function getCurrentRound(draft: PopulatedDraft) {
  return Math.floor(draft.counter / draft.teams.length);
}

export function getCurrentPositionInRound(draft: PopulatedDraft) {
  return draft.counter % draft.teams.length;
}

export function getCurrentPickingTeam(
  draft: PopulatedDraft,
): PopulatedTeam | null {
  const teams = getDraftOrder(draft);
  if (!teams || teams.length === 0) return null;

  const currentRound = getCurrentRound(draft);
  const currentPositionInRound = getCurrentPositionInRound(draft);

  let pickingOrder = [...teams];
  if (draft.orderProgression === "snake" && currentRound % 2 === 1) {
    pickingOrder.reverse();
  }

  if (currentPositionInRound >= pickingOrder.length) {
    return null;
  }

  return pickingOrder[currentPositionInRound];
}

/**
 * Calculates the timer length for a team based on their skip count.
 * Timer is halved for each skip: baseTimer / (2^skipCount)
 * @param baseTimerLength - The base timer length in seconds. `Draft.timerLength`
 *   is an optional field (no schema default) — undefined falls back to the
 *   same 30s floor this function already clamps to, rather than guessing at
 *   a product-level default.
 * @param skipCount - The number of times this team has been skipped
 * @returns The calculated timer length in seconds (minimum 30 seconds)
 */
export function calculateTeamTimer(
  baseTimerLength: number | undefined,
  skipCount: number,
): number {
  const calculatedTimer = (baseTimerLength ?? 30) / Math.pow(2, skipCount);
  return Math.max(30, calculatedTimer);
}

export async function canTeamDraft(
  draft: PopulatedDraft,
  team: PopulatedTeam,
): Promise<boolean> {
  if (draft.status !== "IN_PROGRESS") {
    return false;
  }

  const teams = getDraftOrder(draft);
  const teamsCount = teams.length;
  const currentRound = Math.floor(draft.counter / draft.teams.length);
  const currentPositionInRound = draft.counter % teamsCount;

  let pickingOrder = [...teams];
  if (draft.orderProgression === "snake" && currentRound % 2 === 1) {
    pickingOrder.reverse();
  }
  const teamIndexInPickingOrder = pickingOrder.findIndex((t) =>
    t._id.equals(team._id),
  );
  let pickCount: number;
  if (
    teamIndexInPickingOrder !== -1 &&
    teamIndexInPickingOrder <= currentPositionInRound
  ) {
    pickCount = currentRound + 1;
  } else {
    pickCount = currentRound;
  }
  const teamSize = team.pickLog.length;
  return teamSize < pickCount;
}

export function isAlreadyDrafted(draft: PopulatedDraft, pokemonId: string) {
  return draft.teams.some((t: PopulatedTeam) =>
    t.pickLog.some((p) => getPokemonIdFromDraft(p) === pokemonId),
  );
}

export function cancelSkipTime(draft: PopulatedDraft) {
  const now: Date = new Date();
  const differenceInMs = draft.skipTime
    ? draft.skipTime.getTime() - now.getTime()
    : 0;
  draft.remainingTime = differenceInMs / 1000;
}
