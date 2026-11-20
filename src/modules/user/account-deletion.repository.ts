import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection, Types } from "mongoose";
import { Doc, mongoStore, RewriteStore } from "./account-id-rewriter";

export const PENDING_AUTH0_DELETIONS = "pendingauth0deletions";

export interface LeagueRef {
  leagueSlug: string;
  leagueName: string;
}

export interface TournamentRef extends LeagueRef {
  tournamentSlug: string;
  tournamentName: string;
}

export interface PendingAuth0Deletion {
  signIn: string;
  attempts: number;
}

const OWNED_COLLECTIONS: ReadonlyArray<{ collection: string; field: string }> = [
  { collection: "drafts", field: "owner" },
  { collection: "archives", field: "owner" },
  { collection: "plannerplans", field: "owner" },
  { collection: "teambuilderteams", field: "userSub" },
  { collection: "tierlistimportaliases", field: "owner" },
  { collection: "teamidentities", field: "owner" },
  { collection: "leagueads", field: "owner" },
];

const PERSONAL_FIELDS_TO_CLEAR = ["gameName", "timezone"] as const;
const PERSONAL_FIELDS_TO_UNSET = ["discordName", "discordId"] as const;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

@Injectable()
export class AccountDeletionRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  store(): RewriteStore {
    return mongoStore(this.connection.db!);
  }

  async ownedLeagues(accountId: string): Promise<LeagueRef[]> {
    const leagues = await this.connection
      .collection("leagues")
      .find({ owner: { $eq: accountId } } as never, {
        projection: { slug: 1, name: 1 },
      })
      .toArray();
    return leagues.map((league) => ({
      leagueSlug: String(league.slug),
      leagueName: String(league.name),
    }));
  }

  async openStaffSeats(accountId: string): Promise<TournamentRef[]> {
    const tournaments = await this.connection
      .collection("leaguetournaments")
      .find(
        {
          "staff.sub": { $eq: accountId },
          completedAt: { $in: [null] },
        } as never,
        { projection: { slug: 1, name: 1, league: 1 } },
      )
      .toArray();
    return this.withLeagues(tournaments);
  }

  async openCoachSeats(accountId: string): Promise<TournamentRef[]> {
    const coaches = await this.connection
      .collection("leaguecoaches")
      .find(
        {
          auth0Id: { $eq: accountId },
          leftAt: { $in: [null] },
          completedAt: { $in: [null] },
        } as never,
        { projection: { teamId: 1 } },
      )
      .toArray();
    const teamIds = coaches.map((coach) => coach.teamId);
    if (teamIds.length === 0) return [];
    const teams = await this.connection
      .collection("leagueteams")
      .find({ _id: { $in: teamIds }, status: { $ne: "dropped" } } as never, {
        projection: { tournamentId: 1 },
      })
      .toArray();
    const tournamentIds = unique(teams.map((team) => String(team.tournamentId)));
    if (tournamentIds.length === 0) return [];
    const tournaments = await this.connection
      .collection("leaguetournaments")
      .find(
        {
          _id: { $in: tournamentIds.map((id) => new Types.ObjectId(id)) },
          completedAt: { $in: [null] },
        } as never,
        { projection: { slug: 1, name: 1, league: 1 } },
      )
      .toArray();
    return this.withLeagues(tournaments);
  }

  async deleteOwnedRecords(accountId: string): Promise<void> {
    for (const { collection, field } of OWNED_COLLECTIONS) {
      await this.connection
        .collection(collection)
        .deleteMany({ [field]: { $eq: accountId } } as never);
    }
  }

  async purgeTierLists(accountId: string): Promise<void> {
    const lists = this.connection.collection("leaguetierlists");
    const created = await lists
      .find({ createdBy: { $eq: accountId } } as never, {
        projection: { _id: 1, tournament: 1 },
      })
      .toArray();
    if (created.length > 0) {
      const ids = created.map((list) => list._id);
      const referenced = await this.connection
        .collection("leaguetournaments")
        .find({ tierList: { $in: ids } } as never, {
          projection: { tierList: 1 },
        })
        .toArray();
      const inUse = new Set(referenced.map((doc) => String(doc.tierList)));
      const kept = created.filter(
        (list) => list.tournament || inUse.has(String(list._id)),
      );
      const dropped = created
        .filter((list) => !kept.includes(list))
        .map((list) => list._id);
      if (dropped.length > 0) {
        await lists.deleteMany({ _id: { $in: dropped } } as never);
        await this.connection
          .collection("tierlistrevisions")
          .deleteMany({ tierList: { $in: dropped } } as never);
        await this.connection
          .collection("tierlistinvites")
          .deleteMany({ tierList: { $in: dropped } } as never);
      }
      if (kept.length > 0) {
        await lists.updateMany(
          { _id: { $in: kept.map((list) => list._id) } } as never,
          { $unset: { authorName: "" } },
        );
      }
    }
    await lists.updateMany(
      { "members.sub": { $eq: accountId } } as never,
      { $pull: { members: { sub: accountId } } } as never,
    );
    await lists.updateMany(
      { collaborators: { $eq: accountId } } as never,
      { $pull: { collaborators: accountId } } as never,
    );
  }

  async scrubSharedRecords(accountId: string): Promise<void> {
    const clear = Object.fromEntries(
      PERSONAL_FIELDS_TO_CLEAR.map((field) => [field, ""]),
    );
    const unset = Object.fromEntries(
      PERSONAL_FIELDS_TO_UNSET.map((field) => [field, ""]),
    );
    const personal = { $set: clear, $unset: unset };

    await this.connection
      .collection("leaguecoaches")
      .updateMany({ auth0Id: { $eq: accountId } } as never, personal);

    const applications = this.connection.collection("tournamentapplications");
    await applications.deleteMany({
      auth0Id: { $eq: accountId },
      status: { $eq: "pending" },
    } as never);
    await applications.updateMany(
      { auth0Id: { $eq: accountId } } as never,
      personal,
    );

    await this.connection
      .collection("fileuploads")
      .updateMany({ uploadedBy: { $eq: accountId } } as never, {
        $unset: { uploadedBy: "", ipAddress: "", userAgent: "" },
      });

    await this.connection
      .collection("leagues")
      .updateMany(
        { "admins.sub": { $eq: accountId } } as never,
        { $pull: { admins: { sub: accountId } } } as never,
      );
  }

  async recordPendingAuth0(signIns: string[], now: Date): Promise<void> {
    const pending = this.connection.collection(PENDING_AUTH0_DELETIONS);
    for (const signIn of signIns) {
      await pending.updateOne(
        { signIn: { $eq: signIn } } as never,
        { $setOnInsert: { signIn, createdAt: now, attempts: 0 } },
        { upsert: true },
      );
    }
  }

  async listPendingAuth0(): Promise<PendingAuth0Deletion[]> {
    const rows = await this.connection
      .collection(PENDING_AUTH0_DELETIONS)
      .find({})
      .toArray();
    return rows.map((row) => ({
      signIn: String(row.signIn),
      attempts: Number(row.attempts ?? 0),
    }));
  }

  async resolvePendingAuth0(signIn: string): Promise<void> {
    await this.connection
      .collection(PENDING_AUTH0_DELETIONS)
      .deleteOne({ signIn: { $eq: signIn } } as never);
  }

  async failPendingAuth0(
    signIn: string,
    message: string,
    now: Date,
  ): Promise<void> {
    await this.connection
      .collection(PENDING_AUTH0_DELETIONS)
      .updateOne(
        { signIn: { $eq: signIn } } as never,
        {
          $inc: { attempts: 1 },
          $set: { lastError: message, lastAttemptAt: now },
        },
      );
  }

  private async withLeagues(tournaments: Doc[]): Promise<TournamentRef[]> {
    if (tournaments.length === 0) return [];
    const leagues = await this.connection
      .collection("leagues")
      .find(
        { _id: { $in: unique(tournaments.map((doc) => doc.league)) } } as never,
        { projection: { slug: 1, name: 1 } },
      )
      .toArray();
    const byId = new Map(leagues.map((league) => [String(league._id), league]));
    return tournaments.flatMap((doc) => {
      const league = byId.get(String(doc.league));
      if (!league) return [];
      return [
        {
          leagueSlug: String(league.slug),
          leagueName: String(league.name),
          tournamentSlug: String(doc.slug),
          tournamentName: String(doc.name),
        },
      ];
    });
  }
}
