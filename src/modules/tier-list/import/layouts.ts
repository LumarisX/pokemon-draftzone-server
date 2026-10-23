export const LAYOUT_IDS = [
  "tier-columns",
  "name-tier-rows",
  "name-cost-rows",
  "tier-blocks",
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const LAYOUT_LABELS: Record<LayoutId, string> = {
  "tier-columns": "One tier per column",
  "name-tier-rows": "Pokémon and tier on each row",
  "name-cost-rows": "Pokémon and cost on each row",
  "tier-blocks": "Tier headings with Pokémon under each",
};

export type SheetCell = { text: string; row: number; col: number };

export type ImportedEntry = SheetCell & {
  note?: string;
  addons?: string[];
};

export type ImportedTier = {
  name: string;
  cost?: number;
  banned: boolean;
  entries: ImportedEntry[];
};

export type LayoutResult = {
  layout: LayoutId;
  tiers: ImportedTier[];
  score: number;
};

export type IsPokemon = (text: string) => boolean;

export type Recognizer = {
  strict: IsPokemon;
  loose: IsPokemon;
};

const BANNED = /\b(ban(ned|list)?|illegal|not allowed)\b/i;
const UNTIERED = /^(untiered|free|unpriced|none)$/i;
const COST_SUFFIX = /^(.*?)[\s:–—-]*\(?\s*(\d{1,3})\s*(pts?|points?|p|cost)?\s*\)?\s*$/i;
const PURE_NUMBER = /^\s*(\d{1,3})\s*(pts?|points?|p)?\s*$/i;
const TICK = /^(y|yes|x|✓|✔|true|1)$/i;

export function parseHeading(text: string): { name: string; cost?: number } {
  const trimmed = text.trim();
  const pure = trimmed.match(PURE_NUMBER);
  if (pure) return { name: `${pure[1]} pts`, cost: Number(pure[1]) };

  const suffixed = trimmed.match(COST_SUFFIX);
  if (suffixed) {
    const before = suffixed[1].trim();
    const hasMarker =
      /[(\-–—:]/.test(trimmed.slice(before.length)) || !!suffixed[3];
    const looksLikeIndex = /^(tier|rank|group|level)$/i.test(before);
    if (before && hasMarker && !looksLikeIndex)
      return { name: before, cost: Number(suffixed[2]) };
  }
  return { name: trimmed };
}

function numeric(text: string): number | undefined {
  const match = text.match(PURE_NUMBER);
  return match ? Number(match[1]) : undefined;
}

function columnValues(rows: string[][], col: number, from = 0): SheetCell[] {
  const cells: SheetCell[] = [];
  for (let row = from; row < rows.length; row++) {
    const text = rows[row][col];
    if (text) cells.push({ text, row, col });
  }
  return cells;
}

function headerRow(rows: string[][], isPokemon: IsPokemon): number {
  for (let row = 0; row < Math.min(rows.length, 8); row++) {
    const filled = rows[row].filter(Boolean);
    if (filled.length < 2) continue;
    const pokemon = filled.filter(isPokemon).length;
    if (pokemon / filled.length < 0.34) return row;
  }
  return -1;
}

function tierColumns(rows: string[][], { strict, loose }: Recognizer): LayoutResult | null {
  const header = headerRow(rows, strict);
  if (header < 0) return null;
  const width = rows[0]?.length ?? 0;

  let costRow = -1;
  const next = rows[header + 1];
  if (next) {
    const filled = next.filter(Boolean);
    if (filled.length >= 2 && filled.every((cell) => numeric(cell) !== undefined))
      costRow = header + 1;
  }

  const tiers: ImportedTier[] = [];
  let score = 0;
  for (let col = 0; col < width; col++) {
    const heading = rows[header][col];
    if (!heading) continue;
    const parsed = parseHeading(heading);
    const cost = costRow >= 0 ? numeric(rows[costRow][col]) : parsed.cost;
    const cells = columnValues(rows, col, (costRow >= 0 ? costRow : header) + 1);
    const pokemon = cells.filter((cell) => strict(cell.text));
    if (!pokemon.length) continue;
    const strays = cells.filter((cell) => !loose(cell.text)).length;
    score += pokemon.length - strays * 0.5;
    tiers.push({
      name: parsed.name,
      cost,
      banned: BANNED.test(heading),
      entries: cells,
    });
  }
  return tiers.length >= 2
    ? { layout: "tier-columns", tiers, score: score + 0.5 }
    : null;
}

function pokemonColumn(rows: string[][], isPokemon: IsPokemon) {
  const width = rows[0]?.length ?? 0;
  let best = -1;
  let bestCount = 0;
  for (let col = 0; col < width; col++) {
    const count = columnValues(rows, col).filter((cell) => isPokemon(cell.text)).length;
    if (count > bestCount) {
      best = col;
      bestCount = count;
    }
  }
  return { col: best, count: bestCount };
}

function rowExtras(
  rows: string[][],
  row: number,
  skip: number[],
  headers: string[],
): { note?: string; addons?: string[] } {
  const notes: string[] = [];
  const addons: string[] = [];
  rows[row].forEach((cell, col) => {
    if (!cell || skip.includes(col)) return;
    const header = headers[col] ?? "";
    if (TICK.test(cell) && header) addons.push(header);
    else if (!TICK.test(cell) && !/^(n|no|false|0)$/i.test(cell)) notes.push(cell);
  });
  return {
    ...(notes.length && { note: notes.join(" · ") }),
    ...(addons.length && { addons }),
  };
}

function nameValueRows(rows: string[][], { strict, loose }: Recognizer): LayoutResult[] {
  const { col: nameCol, count } = pokemonColumn(rows, strict);
  if (nameCol < 0 || count < 3) return [];
  const width = rows[0]?.length ?? 0;
  const header = headerRow(rows, strict);
  const headers = header >= 0 ? rows[header] : [];
  const nameRows = columnValues(rows, nameCol).filter(
    (cell) => cell.row !== header && loose(cell.text),
  );

  const results: LayoutResult[] = [];
  for (let col = 0; col < width; col++) {
    if (col === nameCol) continue;
    const values = nameRows.map((cell) => rows[cell.row][col]).filter(Boolean);
    if (values.length < nameRows.length * 0.6) continue;
    const distinct = new Set(values.map((value) => value.toLowerCase()));
    if (distinct.size > Math.max(24, nameRows.length * 0.5)) continue;
    const numbers = values.filter((value) => numeric(value) !== undefined).length;
    const isCost = numbers / values.length > 0.8;

    const tiers = new Map<string, ImportedTier>();
    for (const cell of nameRows) {
      const value = rows[cell.row][col];
      if (!value) continue;
      const key = value.toLowerCase();
      if (!tiers.has(key)) {
        const parsed = isCost
          ? { name: `${numeric(value)} pts`, cost: numeric(value) }
          : parseHeading(value);
        tiers.set(key, {
          name: parsed.name,
          cost: parsed.cost,
          banned: BANNED.test(value),
          entries: [],
        });
      }
      tiers.get(key)!.entries.push({
        ...cell,
        ...rowExtras(rows, cell.row, [nameCol, col], headers),
      });
    }
    const ordered = [...tiers.values()];
    if (isCost) ordered.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
    results.push({
      layout: isCost ? "name-cost-rows" : "name-tier-rows",
      tiers: ordered,
      score: nameRows.length * (values.length / nameRows.length) + (isCost ? 0.5 : 0),
    });
  }
  return results;
}

function tierBlocks(rows: string[][], { strict, loose }: Recognizer): LayoutResult | null {
  const width = rows[0]?.length ?? 0;
  const tiers: ImportedTier[] = [];
  let score = 0;
  for (let col = 0; col < width; col++) {
    let current: ImportedTier | null = null;
    for (let row = 0; row < rows.length; row++) {
      const text = rows[row][col];
      if (!text) continue;
      if (loose(text)) {
        if (current) {
          current.entries.push({ text, row, col });
          if (strict(text)) score++;
        }
        continue;
      }
      if (text.length > 40) continue;
      const parsed = parseHeading(text);
      current = {
        name: parsed.name,
        cost: parsed.cost,
        banned: BANNED.test(text),
        entries: [],
      };
      tiers.push(current);
    }
  }
  const used = tiers.filter((tier) => tier.entries.length);
  if (used.length < 2) return null;
  return { layout: "tier-blocks", tiers: used, score };
}

export function detectLayouts(
  rows: string[][],
  recognizer: Recognizer,
): LayoutResult[] {
  const results: LayoutResult[] = [];
  const columns = tierColumns(rows, recognizer);
  if (columns) results.push(columns);
  results.push(...nameValueRows(rows, recognizer));
  const blocks = tierBlocks(rows, recognizer);
  if (blocks) results.push(blocks);

  const best = new Map<LayoutId, LayoutResult>();
  for (const result of results) {
    const existing = best.get(result.layout);
    if (!existing || result.score > existing.score) best.set(result.layout, result);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export function isUntieredHeading(name: string): boolean {
  return UNTIERED.test(name.trim());
}
