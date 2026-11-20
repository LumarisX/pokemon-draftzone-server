import {
  applyAccountIdChanges,
  normalize,
  revertAccountIdChanges,
  scanAccountIds,
  settable,
  toRewriteRecords,
} from "./account-id-rewriter";
import { Collections, memoryStore } from "./testing/memory-store";

const OLD = "old-id";
const NEW = "new-id";

function world(): Collections {
  return new Map([
    [
      "leagues",
      [
        { _id: "l1", owner: OLD, admins: [{ sub: "x" }, { sub: OLD }], name: "keep" },
        { _id: "l2", owner: "someone", admins: [] },
      ],
    ],
    ["tournamentlogs", [{ _id: "t1", actor: OLD, note: `text ${OLD}` }]],
    ["users", [{ _id: "u1", auth0Sub: OLD }]],
    ["usersignins", [{ _id: "s1", signIn: "a", accountId: OLD }]],
    ["system.views", [{ _id: "v", owner: OLD }]],
  ]);
}

describe("account id rewriter", () => {
  it("finds every string equal to the id, in every collection, with array paths", async () => {
    const result = await scanAccountIds(
      memoryStore(world()),
      new Map([[OLD, NEW]]),
      { skip: new Set(["users"]) },
    );

    expect(result.blockers).toEqual([]);
    expect(result.changes.get("leagues")).toEqual([
      { id: "l1", set: { owner: NEW, "admins.1.sub": NEW } },
    ]);
    expect(result.changes.get("tournamentlogs")).toEqual([
      { id: "t1", set: { actor: NEW } },
    ]);
    expect(result.changes.get("usersignins")).toHaveLength(1);
    expect(result.changes.has("users")).toBe(false);
    expect(result.changes.has("system.views")).toBe(false);
    expect(Object.fromEntries(result.paths)).toEqual({
      "leagues.owner": 1,
      "leagues.admins.$.sub": 1,
      "tournamentlogs.actor": 1,
      "usersignins.accountId": 1,
    });
  });

  it("skips every collection on the skip list", async () => {
    const result = await scanAccountIds(
      memoryStore(world()),
      new Map([[OLD, NEW]]),
      { skip: new Set(["users", "usersignins", "adminaudits"]) },
    );

    expect([...result.changes.keys()].sort()).toEqual([
      "leagues",
      "tournamentlogs",
    ]);
  });

  it("limits a scan to the allowed paths", async () => {
    const result = await scanAccountIds(
      memoryStore(world()),
      new Map([[OLD, NEW]]),
      { skip: new Set(["users"]), allowedPaths: new Set(["leagues.owner"]) },
    );

    expect([...result.changes.keys()]).toEqual(["leagues"]);
    expect(result.changes.get("leagues")).toEqual([
      { id: "l1", set: { owner: NEW } },
    ]);
  });

  it("refuses an id used as an object key and a path that cannot be set", async () => {
    const collections: Collections = new Map([
      ["a", [{ _id: "1", [OLD]: true }]],
      ["b", [{ _id: "2", "dotted.key": OLD }]],
    ]);

    const result = await scanAccountIds(
      memoryStore(collections),
      new Map([[OLD, NEW]]),
      { skip: new Set() },
    );

    expect(result.blockers).toHaveLength(2);
    expect(result.changes.size).toBe(0);
  });

  it("applies the changes, records them, and reverts only those paths", async () => {
    const collections = world();
    const store = memoryStore(collections);
    const map = new Map([[OLD, NEW]]);
    const scan = await scanAccountIds(store, map, { skip: new Set(["users"]) });
    const records = toRewriteRecords(scan.changes);

    const modified = await applyAccountIdChanges(store, scan.changes);

    expect(modified).toBe(3);
    expect(collections.get("leagues")![0]).toMatchObject({
      owner: NEW,
      admins: [{ sub: "x" }, { sub: NEW }],
    });
    expect(collections.get("tournamentlogs")![0].note).toBe(`text ${OLD}`);

    (collections.get("leagues")![1] as Record<string, unknown>).owner = NEW;
    await revertAccountIdChanges(store, records, OLD, NEW);

    expect(collections.get("leagues")![0]).toMatchObject({
      owner: OLD,
      admins: [{ sub: "x" }, { sub: OLD }],
    });
    expect(collections.get("leagues")![1].owner).toBe(NEW);
  });

  it("reverts a path only while it still holds the new id", async () => {
    const collections = world();
    const store = memoryStore(collections);
    const scan = await scanAccountIds(store, new Map([[OLD, NEW]]), {
      skip: new Set(["users"]),
    });
    const records = toRewriteRecords(scan.changes);
    await applyAccountIdChanges(store, scan.changes);
    (collections.get("leagues")![0] as Record<string, unknown>).owner = "third";

    await revertAccountIdChanges(store, records, OLD, NEW);

    expect(collections.get("leagues")![0].owner).toBe("third");
  });

  it("normalizes array positions and rejects unsettable segments", () => {
    expect(normalize("leagues", ["admins", "12", "sub"])).toBe("leagues.admins.$.sub");
    expect(settable(["a", "0", "b"])).toBe(true);
    expect(settable(["a.b"])).toBe(false);
    expect(settable(["$x"])).toBe(false);
    expect(settable([""])).toBe(false);
  });
});
