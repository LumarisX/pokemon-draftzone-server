import { AccountFootprintService, isEmptyFootprint } from "./account-footprint.service";
import { ACCOUNT_FOOTPRINT } from "./account-footprint.table";

const PLAN_INVENTORY: Record<string, string[]> = {
  users: ["auth0Sub"],
  leaguecoaches: ["auth0Id"],
  tournamentapplications: ["auth0Id", "decidedBy"],
  tournamentmessages: ["author", "deletedBy"],
  leagues: ["owner", "admins.sub"],
  leagueadmininvites: ["createdBy", "acceptedBy"],
  leaguetournaments: [
    "ownerName.sub",
    "staff.sub",
    "trades.submittedBy",
    "trades.resolvedBy",
    "discordLinkCode.createdBy",
  ],
  organizerinvites: ["createdBy", "acceptedBy"],
  leaguematchups: ["report.submittedBy"],
  leaguestages: ["seedingLog.seededBy"],
  leagueteams: ["nameHistory.changedBy", "nameLockedBy"],
  teamidentities: ["owner"],
  teambuilderteams: ["userSub"],
  tierlistimportaliases: ["owner"],
  tierlistinvites: ["createdBy", "acceptedBy"],
  tierlistrevisions: ["actor"],
  leaguetierlists: ["createdBy", "members.sub", "collaborators"],
  leagueads: ["owner"],
  drafts: ["owner"],
  archives: ["owner"],
  plannerplans: ["owner"],
  fileuploads: ["uploadedBy"],
  tournamentlogs: ["actor"],
};

describe("ACCOUNT_FOOTPRINT", () => {
  it("lists exactly the plan's inventory apart from the users row", () => {
    const table = Object.fromEntries(
      ACCOUNT_FOOTPRINT.map((source) => [source.collection, [...source.fields]]),
    );
    const expected = Object.fromEntries(
      Object.entries(PLAN_INVENTORY).filter(([name]) => name !== "users"),
    );

    expect(table).toEqual(expected);
  });

  it("covers 36 fields in 23 collections once the users row is counted", () => {
    const fields = ACCOUNT_FOOTPRINT.reduce(
      (total, source) => total + source.fields.length,
      1,
    );

    expect(fields).toBe(36);
    expect(ACCOUNT_FOOTPRINT.length + 1).toBe(23);
    expect(Object.values(PLAN_INVENTORY).flat()).toHaveLength(36);
  });

  it("never lists a collection twice", () => {
    const names = ACCOUNT_FOOTPRINT.map((source) => source.collection);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("AccountFootprintService", () => {
  function build(counts: Record<string, number>) {
    const connection = {
      collection: jest.fn((name: string) => ({
        countDocuments: jest.fn(async () => counts[name] ?? 0),
      })),
    };
    const service = new AccountFootprintService(connection as any);
    return { service, connection };
  }

  it("counts every collection with an $or over its fields", async () => {
    const queries: Record<string, unknown> = {};
    const connection = {
      collection: jest.fn((name: string) => ({
        countDocuments: jest.fn(async (query: unknown) => {
          queries[name] = query;
          return name === "drafts" ? 3 : 0;
        }),
      })),
    };
    const service = new AccountFootprintService(connection as any);

    const result = await service.footprint("account-1");

    expect(result).toHaveLength(ACCOUNT_FOOTPRINT.length);
    expect(result.find((entry) => entry.collection === "drafts")).toEqual({
      collection: "drafts",
      count: 3,
    });
    expect(queries["tournamentapplications"]).toEqual({
      $or: [
        { auth0Id: { $eq: "account-1" } },
        { decidedBy: { $eq: "account-1" } },
      ],
    });
    expect(queries["leaguetierlists"]).toEqual({
      $or: [
        { createdBy: { $eq: "account-1" } },
        { "members.sub": { $eq: "account-1" } },
        { collaborators: { $eq: "account-1" } },
      ],
    });
  });

  it("is empty when every count is zero", async () => {
    const { service } = build({});

    expect(await service.isEmpty("account-1")).toBe(true);
  });

  it("is not empty when any single collection holds a reference", async () => {
    const { service } = build({ archives: 1 });

    expect(await service.isEmpty("account-1")).toBe(false);
  });

  it("reads emptiness off a footprint", () => {
    expect(isEmptyFootprint([{ collection: "a", count: 0 }])).toBe(true);
    expect(isEmptyFootprint([{ collection: "a", count: 2 }])).toBe(false);
  });
});
