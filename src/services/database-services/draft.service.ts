import { ID, toID } from "@pkmn/data";
import { LRUCache } from "lru-cache";
import mongoose, { Types } from "mongoose";
import { Ruleset } from "../../data/rulesets";
import { DraftData, DraftDocument, DraftModel } from "../../models/draft.model";
import { getName } from "../data-services/pokedex.service";
import { getMatchupsByDraftId } from "./matchup.service";

const $drafts = new LRUCache<string, DraftDocument>({
  max: 100,
  ttl: 1000 * 60 * 5,
});

export async function createDraft(draft: DraftData) {
  const draftDoc = new DraftModel(draft);
  await draftDoc.save();
  const key = `${draftDoc.owner}:${draftDoc.leagueId}`;
  $drafts.set(key, draftDoc);
  $drafts.set(draftDoc._id.toString(), draftDoc);
  return draftDoc;
}

export async function getDraftsByOwner(
  ownerId: string
): Promise<DraftDocument[]> {
  return DraftModel.find({
    owner: ownerId,
  }).sort({
    createdAt: -1,
  });
}

export async function getDraft(
  id: Types.ObjectId,
  ownerId?: string
): Promise<DraftDocument | null> {
  const key: string = ownerId ? `${ownerId}:${id}` : id.toString();
  if ($drafts.has(key)) {
    return $drafts.get(key)!;
  }

  let draft: DraftDocument | null = null;
  if (ownerId) {
    draft = await DraftModel.findOne({ owner: ownerId, leagueId: id });
  } else if (Types.ObjectId.isValid(id)) {
    draft = await DraftModel.findById(id);
  }

  if (draft) {
    $drafts.set(key, draft);
    if (ownerId) {
      $drafts.set(draft._id.toString(), draft);
    } else {
      if (draft.owner && draft.leagueId) {
        $drafts.set(`${draft.owner}:${draft.leagueId}`, draft);
      }
    }
  }

  return draft;
}

export async function updateDraft(
  ownerId: string,
  leagueId: string,
  draft: DraftData
) {
  const updatedDraft = await DraftModel.findOneAndUpdate(
    { owner: ownerId, leagueId: leagueId },
    draft,
    { new: true, upsert: true }
  );
  if (updatedDraft) {
    const key = `${ownerId}:${leagueId}`;
    $drafts.delete(key);
    $drafts.delete(updatedDraft._id.toString());
    $drafts.set(key, updatedDraft);
    $drafts.set(updatedDraft._id.toString(), updatedDraft);
  }
  return updatedDraft;
}

export async function deleteDraft(draft: DraftDocument) {
  const result = await draft.deleteOne();
  $drafts.delete(draft._id.toString());
  if (draft.owner && draft.leagueId) {
    const key = `${draft.owner}:${draft.leagueId}`;
    $drafts.delete(key);
  }
  return result;
}

export async function getScore(draftId: Types.ObjectId) {
  let matchups = await getMatchupsByDraftId(draftId);
  let score = { wins: 0, loses: 0, diff: "+0" };
  let numDiff = 0;
  let gameDiff = matchups.some((matchup) => matchup.matches.length > 1);
  if (gameDiff) {
    matchups.forEach((matchup) => {
      let matchupWins = 0;
      let matchupLoses = 0;
      matchup.matches.forEach((match) => {
        if (match.winner === "a") {
          matchupWins++;
        } else if (match.winner === "b") {
          matchupLoses++;
        }
      });
      if (matchupWins > matchupLoses) {
        score.wins++;
      } else if (matchupLoses > matchupWins) {
        score.loses++;
      }
      numDiff += matchupWins - matchupLoses;
    });
  } else {
    for (let matchup of matchups) {
      if (matchup.matches[0]) {
        if (matchup.matches[0].aTeam.score > matchup.matches[0].bTeam.score) {
          score.wins++;
        } else if (
          matchup.matches[0].aTeam.score < matchup.matches[0].bTeam.score
        ) {
          score.loses++;
        }
        numDiff +=
          matchup.matches[0].aTeam.score - matchup.matches[0].bTeam.score;
      }
    }
  }
  score.diff = (numDiff < 0 ? "" : "+") + numDiff;
  return score;
}

export async function getStats(ruleset: Ruleset, draftId: Types.ObjectId) {
  let matchups = await getMatchupsByDraftId(draftId);
  let stats: {
    [key: string]: {
      pokemon: { id: ID; name: string };
      kills: number;
      brought: number;
      indirect: number;
      deaths: number;
      kdr: number;
      kpg: number;
    };
  } = {};
  for (const matchup of matchups) {
    for (const game of matchup.matches) {
      let stat = Object.fromEntries(game.aTeam.stats);
      for (const id in stat) {
        if (!(id in stats)) {
          stats[id] = {
            pokemon: { id: toID(id), name: getName(id) },
            kills: 0,
            brought: 0,
            indirect: 0,
            deaths: 0,
            kdr: 0,
            kpg: 0,
          };
        }
        const teamStats = stat[toID(id)];
        if (teamStats) {
          stats[id].kills += teamStats.kills ?? 0;
          stats[id].brought += teamStats.brought ?? 0;
          stats[id].indirect += teamStats.indirect ?? 0;
          stats[id].deaths += teamStats.deaths ?? 0;
        }
      }
    }
  }

  for (let id in stats) {
    stats[id].kdr = stats[id].kills + stats[id].indirect - stats[id].deaths;
    stats[id].kpg =
      stats[id].brought > 0
        ? (stats[id].kills + stats[id].indirect) / stats[id].brought
        : 0;
  }
  return Object.values(stats);
}
