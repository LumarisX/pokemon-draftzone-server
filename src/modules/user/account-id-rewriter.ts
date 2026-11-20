import type { Connection } from "mongoose";

export type Doc = Record<string, unknown>;
type Db = NonNullable<Connection["db"]>;

export interface DocChange {
  id: unknown;
  set: Record<string, string>;
}

export interface UpdateOp {
  filter: Doc;
  set: Record<string, unknown>;
}

export interface ScanResult {
  changes: Map<string, DocChange[]>;
  paths: Map<string, number>;
  blockers: string[];
  scanned: number;
}

export interface RewriteRecord {
  collection: string;
  id: unknown;
  paths: string[];
}

export interface RewriteStore {
  collections(): Promise<string[]>;
  documents(collection: string): AsyncIterable<Doc>;
  update(collection: string, ops: UpdateOp[]): Promise<number>;
}

export interface ScanOptions {
  skip: ReadonlySet<string>;
  allowedPaths?: ReadonlySet<string> | null;
}

export const BATCH_SIZE = 500;

const INDEX = /^\d+$/;

export function isNode(value: unknown): value is Doc | unknown[] {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Date || Buffer.isBuffer(value)) return false;
  return !("_bsontype" in value);
}

export function normalize(collection: string, segments: string[]): string {
  return `${collection}.${segments
    .map((segment) => (INDEX.test(segment) ? "$" : segment))
    .join(".")}`;
}

export function settable(segments: string[]): boolean {
  return segments.every(
    (segment) =>
      segment !== "" && !segment.includes(".") && !segment.startsWith("$"),
  );
}

export function walk(
  value: unknown,
  segments: string[],
  onValue: (text: string, segments: string[]) => void,
  onKey: (key: string, segments: string[]) => void,
): void {
  if (typeof value === "string") {
    onValue(value, segments);
    return;
  }
  if (!isNode(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walk(item, [...segments, String(index)], onValue, onKey),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    onKey(key, segments);
    walk(child, [...segments, key], onValue, onKey);
  }
}

export async function scanAccountIds(
  store: RewriteStore,
  map: ReadonlyMap<string, string>,
  options: ScanOptions,
): Promise<ScanResult> {
  const result: ScanResult = {
    changes: new Map(),
    paths: new Map(),
    blockers: [],
    scanned: 0,
  };
  const allowedPaths = options.allowedPaths ?? null;
  const collections = (await store.collections())
    .filter((name) => !options.skip.has(name) && !name.startsWith("system."))
    .sort();

  for (const name of collections) {
    const changes: DocChange[] = [];
    for await (const doc of store.documents(name)) {
      result.scanned++;
      const set: Record<string, string> = {};
      walk(
        doc,
        [],
        (text, segments) => {
          const replacement = map.get(text);
          if (replacement === undefined) return;
          const path = normalize(name, segments);
          if (allowedPaths && !allowedPaths.has(path)) return;
          if (!settable(segments)) {
            result.blockers.push(
              `${name} ${String(doc._id)}: path ${segments.join(".")} cannot be set by dotted path`,
            );
            return;
          }
          set[segments.join(".")] = replacement;
          result.paths.set(path, (result.paths.get(path) ?? 0) + 1);
        },
        (key, segments) => {
          if (!map.has(key)) return;
          result.blockers.push(
            `${name} ${String(doc._id)}: id used as an object key at ${[...segments, key].join(".")}`,
          );
        },
      );
      if (Object.keys(set).length) changes.push({ id: doc._id, set });
    }
    if (changes.length) result.changes.set(name, changes);
  }
  return result;
}

export async function applyAccountIdChanges(
  store: RewriteStore,
  changes: ReadonlyMap<string, DocChange[]>,
  onCollection?: (collection: string, docs: number) => void,
): Promise<number> {
  let modified = 0;
  for (const [name, docs] of changes) {
    for (let start = 0; start < docs.length; start += BATCH_SIZE) {
      const batch = docs.slice(start, start + BATCH_SIZE);
      modified += await store.update(
        name,
        batch.map((change) => ({
          filter: { _id: change.id },
          set: change.set,
        })),
      );
    }
    onCollection?.(name, docs.length);
  }
  return modified;
}

export function toRewriteRecords(
  changes: ReadonlyMap<string, DocChange[]>,
): RewriteRecord[] {
  const records: RewriteRecord[] = [];
  for (const [collection, docs] of changes) {
    for (const change of docs) {
      records.push({
        collection,
        id: change.id,
        paths: Object.keys(change.set),
      });
    }
  }
  return records;
}

export async function revertAccountIdChanges(
  store: RewriteStore,
  records: readonly RewriteRecord[],
  from: string,
  to: string,
): Promise<number> {
  const byCollection = new Map<string, UpdateOp[]>();
  for (const record of records) {
    const ops = byCollection.get(record.collection) ?? [];
    for (const path of record.paths) {
      ops.push({
        filter: { _id: record.id, [path]: to },
        set: { [path]: from },
      });
    }
    byCollection.set(record.collection, ops);
  }
  let modified = 0;
  for (const [name, ops] of byCollection) {
    for (let start = 0; start < ops.length; start += BATCH_SIZE) {
      modified += await store.update(name, ops.slice(start, start + BATCH_SIZE));
    }
  }
  return modified;
}

export function mongoStore(db: Db): RewriteStore {
  return {
    async collections() {
      return (await db.listCollections({ type: "collection" }).toArray()).map(
        (entry) => entry.name,
      );
    },
    documents(collection) {
      return db
        .collection(collection)
        .find({})
        .batchSize(BATCH_SIZE) as unknown as AsyncIterable<Doc>;
    },
    async update(collection, ops) {
      if (ops.length === 0) return 0;
      const outcome = await db.collection(collection).bulkWrite(
        ops.map((op) => ({
          updateOne: {
            filter: op.filter as never,
            update: { $set: op.set },
          },
        })),
        { ordered: false },
      );
      return outcome.modifiedCount;
    },
  };
}
