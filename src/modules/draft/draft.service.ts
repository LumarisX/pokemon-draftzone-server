import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ID, toID } from "@pkmn/data";
import { LRUCache } from "lru-cache";
import { ClientSession, Model, Types } from "mongoose";
import { Draft } from "../../classes/draft";
import { Matchup } from "../../classes/matchup";
import { PokemonFormData } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";
import { DraftDocument } from "../../models/draft/draft.model";
import { MatchupDocument } from "../../models/draft/matchup.model";
import { getTournamentsByOwner } from "../../services/league-services/league-service";
import { MatchupService } from "./matchup.service";
import { PokedexService } from "./pokedex.service";

interface PokemonStatTotals {
  pokemon: { id: ID; name: string };
  kills: number;
  brought: number;
  indirect: number;
  deaths: number;
  kdr: number;
  kpg: number;
}

export interface CreateTeamBody {
  leagueName: string;
  teamName: string;
  format: string;
  ruleset: string;
  doc?: string;
  team: PokemonFormData[];
}

@Injectable()
export class DraftService {
  private readonly draftsCache = new LRUCache<string, DraftDocument>({
    max: 100,
    ttl: 1000 * 60 * 5,
  });

  constructor(
    @InjectModel(Draft.name) private readonly draftModel: Model<DraftDocument>,
    @InjectModel(Matchup.name)
    private readonly matchupModel: Model<MatchupDocument>,
    private readonly matchupService: MatchupService,
    private readonly pokedexService: PokedexService,
  ) {}

  async createDraft(draftData: any): Promise<DraftDocument> {
    const draftDoc = new this.draftModel(draftData);
    await draftDoc.save();

    const key = `${draftDoc.owner}:${draftDoc.leagueId}`;
    this.draftsCache.set(key, draftDoc);
    this.draftsCache.set(draftDoc._id.toString(), draftDoc);

    return draftDoc;
  }

  async getDraftsByOwner(ownerId: string): Promise<DraftDocument[]> {
    return this.draftModel
      .find({ owner: ownerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getDraft(
    id: Types.ObjectId | string,
    ownerId?: string,
  ): Promise<DraftDocument> {
    const key = ownerId ? `${ownerId}:${id}` : id.toString();
    if (this.draftsCache.has(key)) return this.draftsCache.get(key)!;

    let draft: DraftDocument | null = null;

    if (ownerId) {
      draft = await this.draftModel
        .findOne({
          owner: ownerId,
          leagueId: id.toString(),
        })
        .exec();
    } else if (Types.ObjectId.isValid(id)) {
      draft = await this.draftModel.findById(id).exec();
    }

    if (!draft) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);

    this.draftsCache.set(key, draft);
    if (ownerId) {
      this.draftsCache.set(draft._id.toString(), draft);
    } else if (draft.owner && draft.leagueId) {
      this.draftsCache.set(`${draft.owner}:${draft.leagueId}`, draft);
    }

    return draft;
  }

  async updateDraft(
    ownerId: string,
    tournamentId: string,
    draftData: any,
  ): Promise<DraftDocument> {
    const updatedDraft = await this.draftModel
      .findOneAndUpdate({ owner: ownerId, leagueId: tournamentId }, draftData, {
        new: true,
        upsert: true,
      })
      .exec();

    if (!updatedDraft) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);

    const key = `${ownerId}:${tournamentId}`;
    this.draftsCache.delete(key);
    this.draftsCache.delete(updatedDraft._id.toString());
    this.draftsCache.set(key, updatedDraft);
    this.draftsCache.set(updatedDraft._id.toString(), updatedDraft);

    return updatedDraft;
  }

  async deleteDraft(
    draft: DraftDocument,
    session?: ClientSession,
  ): Promise<any> {
    const result = await draft.deleteOne({ session });
    this.draftsCache.delete(draft._id.toString());
    if (draft.owner && draft.leagueId) {
      this.draftsCache.delete(`${draft.owner}:${draft.leagueId}`);
    }
    return result;
  }

  async getScore(draftId: Types.ObjectId) {
    // 3. Leverage the injected service instead of global function imports
    const matchups = await this.matchupService.getMatchupsByDraftId(draftId);
    const score = { wins: 0, losses: 0, diff: "+0" };
    let numDiff = 0;

    const gameDiff = matchups.some((matchup) => matchup.matches.length > 1);

    if (gameDiff) {
      matchups.forEach((matchup) => {
        let matchupWins = 0;
        let matchupLoses = 0;
        matchup.matches.forEach((match) => {
          if (match.winner === "a") matchupWins++;
          else if (match.winner === "b") matchupLoses++;
        });
        if (matchupWins > matchupLoses) score.wins++;
        else if (matchupLoses > matchupWins) score.losses++;
        numDiff += matchupWins - matchupLoses;
      });
    } else {
      for (const matchup of matchups) {
        if (matchup.matches[0]) {
          const { aTeam, bTeam } = matchup.matches[0];
          if (aTeam.score > bTeam.score) score.wins++;
          else if (aTeam.score < bTeam.score) score.losses++;
          numDiff += aTeam.score - bTeam.score;
        }
      }
    }

    score.diff = (numDiff < 0 ? "" : "+") + numDiff;
    return score;
  }

  async getStats(ruleset: Ruleset, draftId: Types.ObjectId) {
    const rawMatchups = await this.matchupModel
      .find({ "aTeam._id": draftId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const stats: Record<string, PokemonStatTotals> = {};

    for (const matchup of rawMatchups) {
      const matches = Array.isArray(matchup.matches) ? matchup.matches : [];
      for (const game of matches) {
        for (const [pid, teamStats] of game.aTeam.stats) {
          const id = toID(pid);
          if (!(id in stats)) {
            stats[id] = {
              // 4. Use injected service for Pokedex data fetching
              pokemon: { id, name: this.pokedexService.getName(pid) },
              kills: 0,
              brought: 0,
              indirect: 0,
              deaths: 0,
              kdr: 0,
              kpg: 0,
            };
          }
          stats[id].kills += teamStats.kills ?? 0;
          stats[id].brought += teamStats.brought ?? 0;
          stats[id].indirect += teamStats.indirect ?? 0;
          stats[id].deaths += teamStats.deaths ?? 0;
        }
      }
    }

    for (const id in stats) {
      stats[id].kdr = stats[id].kills + stats[id].indirect - stats[id].deaths;
      stats[id].kpg =
        stats[id].brought > 0
          ? (stats[id].kills + stats[id].indirect) / stats[id].brought
          : 0;
    }

    return { pokemon: Object.values(stats) };
  }

  async getTeams(sub: string) {
    const draftDocs = await this.getDraftsByOwner(sub);
    const drafts = await Promise.all(
      draftDocs.map(async (draft) => await Draft.fromData(draft).toClient()),
    );
    const tournaments = await getTournamentsByOwner(sub);
    return { drafts, tournaments };
  }

  async createTeam(body: CreateTeamBody, sub: string) {
    const draft = Draft.fromForm(body, sub);
    await this.createDraft(draft.toData());
    return { message: "Draft Added" };
  }
}
