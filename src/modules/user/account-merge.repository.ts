import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection, Types } from "mongoose";
import {
  Doc,
  mongoStore,
  RewriteRecord,
  RewriteStore,
} from "./account-id-rewriter";

export const MERGE_RECORDS = "accountmergerecords";
export const PLANNER_PLANS = "plannerplans";
export const EXTERNAL_DRAFTS = "drafts";
export const IMPORT_ALIASES = "tierlistimportaliases";
export const APPLICATIONS = "tournamentapplications";

const RECORD_CHUNK = 1000;

export interface MergeCounts {
  teams: number;
  leagues: number;
  tournaments: number;
  drafts: number;
  tierLists: number;
  plans: number;
}

@Injectable()
export class AccountMergeRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  store(): RewriteStore {
    return mongoStore(this.connection.db!);
  }

  async counts(accountId: string): Promise<MergeCounts> {
    const count = (collection: string, filter: Doc) =>
      this.connection.collection(collection).countDocuments(filter as never);
    const [teams, leagues, tournaments, drafts, archives, tierLists, plans] =
      await Promise.all([
        count("leaguecoaches", { auth0Id: { $eq: accountId } }),
        count("leagues", {
          $or: [{ owner: { $eq: accountId } }, { "admins.sub": { $eq: accountId } }],
        }),
        count("leaguetournaments", { "staff.sub": { $eq: accountId } }),
        count(EXTERNAL_DRAFTS, {
          owner: { $eq: accountId },
          archivedAt: { $in: [null] },
        }),
        count("archives", { owner: { $eq: accountId } }),
        count("leaguetierlists", {
          tournament: { $in: [null] },
          $or: [
            { createdBy: { $eq: accountId } },
            { "members.sub": { $eq: accountId } },
          ],
        }),
        count(PLANNER_PLANS, { owner: { $eq: accountId } }),
      ]);
    return {
      teams,
      leagues,
      tournaments,
      drafts: drafts + archives,
      tierLists,
      plans,
    };
  }

  async planCounts(accountId: string): Promise<Map<string, number>> {
    const docs = await this.connection
      .collection(PLANNER_PLANS)
      .find({ owner: { $eq: accountId } }, { projection: { key: 1, plans: 1 } })
      .toArray();
    return new Map(
      docs.map((doc) => [
        String(doc.key),
        Array.isArray(doc.plans) ? doc.plans.length : 0,
      ]),
    );
  }

  async participantTournaments(accountId: string): Promise<string[]> {
    const coaches = await this.connection
      .collection("leaguecoaches")
      .find({ auth0Id: { $eq: accountId } } as never, { projection: { teamId: 1 } })
      .toArray();
    const teamIds = coaches.map((coach) => coach.teamId);
    if (teamIds.length === 0) return [];
    const teams = await this.connection
      .collection("leagueteams")
      .find({ _id: { $in: teamIds } } as never, {
        projection: { tournamentId: 1 },
      })
      .toArray();
    return unique(teams.map((doc) => String(doc.tournamentId)));
  }

  async staffTournaments(accountId: string): Promise<string[]> {
    const tournaments = await this.connection
      .collection("leaguetournaments")
      .find({ "staff.sub": { $eq: accountId } } as never, { projection: { _id: 1 } })
      .toArray();
    return tournaments.map((doc) => String(doc._id));
  }

  async liveDraftTournaments(accountId: string): Promise<string[]> {
    const coaches = await this.connection
      .collection("leaguecoaches")
      .find({ auth0Id: { $eq: accountId } } as never, { projection: { teamId: 1 } })
      .toArray();
    const teamIds = coaches.map((coach) => coach.teamId);
    if (teamIds.length === 0) return [];
    const teams = await this.connection
      .collection("leagueteams")
      .find({ _id: { $in: teamIds } } as never, {
        projection: { draftId: 1 },
      })
      .toArray();
    const draftIds = teams.map((team) => team.draftId).filter(Boolean);
    if (draftIds.length === 0) return [];
    const drafts = await this.connection
      .collection("leaguedrafts")
      .find({ _id: { $in: draftIds }, status: { $eq: "IN_PROGRESS" } } as never, {
        projection: { tournamentId: 1 },
      })
      .toArray();
    return unique(drafts.map((draft) => String(draft.tournamentId)));
  }

  async tournamentNames(ids: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (ids.length === 0) return names;
    const tournaments = await this.connection
      .collection("leaguetournaments")
      .find(
        { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } } as never,
        { projection: { name: 1 } },
      )
      .toArray();
    for (const doc of tournaments) names.set(String(doc._id), String(doc.name));
    return names;
  }

  async find(collection: string, filter: Doc): Promise<Doc[]> {
    const docs = await this.connection
      .collection(collection)
      .find(filter as never)
      .toArray();
    return docs as Doc[];
  }

  async insert(collection: string, doc: Doc): Promise<void> {
    await this.connection.collection(collection).insertOne(doc as never);
  }

  async remove(collection: string, id: unknown): Promise<void> {
    await this.connection
      .collection(collection)
      .deleteOne({ _id: id } as never);
  }

  async setFields(
    collection: string,
    filter: Doc,
    set: Doc,
  ): Promise<boolean> {
    const result = await this.connection
      .collection(collection)
      .updateOne(filter as never, { $set: set });
    return result.modifiedCount === 1;
  }

  async saveRecords(
    auditId: string,
    records: readonly RewriteRecord[],
  ): Promise<void> {
    const collection = this.connection.collection(MERGE_RECORDS);
    for (let start = 0, seq = 0; start < records.length; start += RECORD_CHUNK, seq++) {
      await collection.insertOne({
        auditId,
        seq,
        records: records.slice(start, start + RECORD_CHUNK),
      } as never);
    }
  }

  async loadRecords(auditId: string): Promise<RewriteRecord[]> {
    const chunks = await this.connection
      .collection(MERGE_RECORDS)
      .find({ auditId: { $eq: auditId } } as never)
      .sort({ seq: 1 })
      .toArray();
    return chunks.flatMap((chunk) => chunk.records as RewriteRecord[]);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
