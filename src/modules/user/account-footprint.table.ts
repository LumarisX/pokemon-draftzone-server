export interface FootprintSource {
  collection: string;
  fields: readonly string[];
}

export const ACCOUNT_FOOTPRINT: readonly FootprintSource[] = [
  { collection: "leaguecoaches", fields: ["auth0Id"] },
  { collection: "tournamentapplications", fields: ["auth0Id", "decidedBy"] },
  { collection: "tournamentmessages", fields: ["author", "deletedBy"] },
  { collection: "leagues", fields: ["owner", "admins.sub"] },
  { collection: "leagueadmininvites", fields: ["createdBy", "acceptedBy"] },
  {
    collection: "leaguetournaments",
    fields: [
      "ownerName.sub",
      "staff.sub",
      "trades.submittedBy",
      "trades.resolvedBy",
      "discordLinkCode.createdBy",
    ],
  },
  { collection: "organizerinvites", fields: ["createdBy", "acceptedBy"] },
  { collection: "leaguematchups", fields: ["report.submittedBy"] },
  { collection: "leaguestages", fields: ["seedingLog.seededBy"] },
  {
    collection: "leagueteams",
    fields: ["nameHistory.changedBy", "nameLockedBy"],
  },
  { collection: "teamidentities", fields: ["owner"] },
  { collection: "teambuilderteams", fields: ["userSub"] },
  { collection: "tierlistimportaliases", fields: ["owner"] },
  { collection: "tierlistinvites", fields: ["createdBy", "acceptedBy"] },
  { collection: "tierlistrevisions", fields: ["actor"] },
  {
    collection: "leaguetierlists",
    fields: ["createdBy", "members.sub", "collaborators"],
  },
  { collection: "leagueads", fields: ["owner"] },
  { collection: "drafts", fields: ["owner"] },
  { collection: "archives", fields: ["owner"] },
  { collection: "plannerplans", fields: ["owner"] },
  { collection: "fileuploads", fields: ["uploadedBy"] },
  { collection: "tournamentlogs", fields: ["actor"] },
];
