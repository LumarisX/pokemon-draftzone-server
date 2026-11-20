import { Doc, RewriteStore } from "../account-id-rewriter";

export type Collections = Map<string, Doc[]>;

export function getPath(doc: Doc, path: string): unknown {
  let current: unknown = doc;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setPath(doc: Doc, path: string, value: unknown): void {
  const segments = path.split(".");
  let current = doc as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    if (current[segment] === null || typeof current[segment] !== "object") {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

export function unsetPath(doc: Doc, path: string): void {
  const segments = path.split(".");
  let current: unknown = doc;
  for (const segment of segments.slice(0, -1)) {
    if (current === null || typeof current !== "object") return;
    current = (current as Record<string, unknown>)[segment];
  }
  if (current && typeof current === "object") {
    delete (current as Record<string, unknown>)[segments[segments.length - 1]];
  }
}

export function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const actual = getPath(doc, key);
    const expected =
      condition && typeof condition === "object" && "$eq" in condition
        ? (condition as { $eq: unknown }).$eq
        : condition;
    return String(actual) === String(expected);
  });
}

export function memoryStore(collections: Collections): RewriteStore {
  return {
    async collections() {
      return [...collections.keys()];
    },
    documents(collection) {
      const docs = [...(collections.get(collection) ?? [])];
      return (async function* () {
        for (const doc of docs) yield structuredClone(doc);
      })();
    },
    async update(collection, ops) {
      let modified = 0;
      for (const op of ops) {
        const doc = (collections.get(collection) ?? []).find((candidate) =>
          matches(candidate, op.filter),
        );
        if (!doc) continue;
        for (const [path, value] of Object.entries(op.set)) {
          setPath(doc, path, value);
        }
        modified++;
      }
      return modified;
    },
  };
}
