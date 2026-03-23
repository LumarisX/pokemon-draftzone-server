import type { Move } from "@pkmn/dex-types";
import { DraftSpecie } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";

type Primitive = string | number | boolean;
type SearchValue = Primitive | Primitive[];
type ResolvedFieldValue = Primitive | Primitive[] | undefined;

export type SearchOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "notContains"
  | "in"
  | "nin";

export type MoveField =
  | "id"
  | "name"
  | "type"
  | "category"
  | "basePower"
  | "accuracy"
  | "pp"
  | "priority"
  | "target";

export type MoveFilter = {
  field: MoveField | string;
  operator: SearchOperator;
  value: SearchValue;
};

export type SearchField =
  | "id"
  | "name"
  | "fullname"
  | "baseSpecies"
  | "num"
  | "gen"
  | "tier"
  | "natDexTier"
  | "doublesTier"
  | "isNonstandard"
  | "types"
  | "abilities"
  | "eggGroups"
  | "weaks"
  | "resists"
  | "immunities"
  | "tags"
  | "weightkg"
  | "bst"
  | "cst"
  | "hp"
  | "atk"
  | "def"
  | "spa"
  | "spd"
  | "spe"
  | "nfe"
  | "evolved"
  | "isCosmeticForme"
  | "isMega"
  | "isPrimal"
  | "isGigantamax"
  | "prevo"
  | "evos"
  | "requiredAbility"
  | "requiredItem"
  | "requiredItems"
  | "requiredMove"
  | "learns"
  | "coverage";

export type SearchSortDirection = "asc" | "desc";
export type SearchLogicalMode = "and" | "or";

export type SearchFilter = {
  field: SearchField | string;
  operator: SearchOperator;
  value?: SearchValue;
  moveFilters?: MoveFilter[];
  moveMode?: SearchLogicalMode;
};

export type SearchGroup = {
  mode?: SearchLogicalMode;
  searches?: SearchExpression[];
};

export type SearchExpression = SearchFilter | SearchGroup;

export type SearchPokemonOptions = {
  searches?: SearchExpression[];
  mode?: SearchLogicalMode;
  sortBy?: SearchField | string;
  sortDirection?: SearchSortDirection;
  limit?: number;
  offset?: number;
};

export type SearchPokemonResult = {
  results: DraftSpecie[];
  total: number;
  limit: number;
  offset: number;
};

type FieldType = "string" | "number" | "boolean" | "string[]";

type FieldBase = {
  type: FieldType;
  ranker?: (value: string) => number | undefined;
};

type FieldDefinition = FieldBase & {
  resolver: (
    specie: DraftSpecie,
  ) => Promise<ResolvedFieldValue> | ResolvedFieldValue;
};

type MoveFieldDefinition = FieldBase & {
  resolver: (move: Move) => ResolvedFieldValue;
};

type MoveCanonicalField = MoveField;

function getRequiredItemValues(specie: DraftSpecie): string[] {
  const values = new Set<string>();
  if (specie.requiredItem) {
    values.add(specie.requiredItem);
  }
  for (const item of specie.requiredItems ?? []) {
    values.add(item);
  }
  return [...values];
}

const IMMUNITY_LABEL_MAP: Record<string, string> = {
  slp: "Sleep",
  par: "Paralysis",
  psn: "Poison",
  tox: "Badly Poisoned",
  brn: "Burn",
  frz: "Freeze",
  sand: "Sandstorm",
  prankster: "Prankster",
};

function toDisplayLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";

  const key = normalized.toLowerCase();
  if (IMMUNITY_LABEL_MAP[key]) {
    return IMMUNITY_LABEL_MAP[key];
  }

  return normalized
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getDisplayImmunities(specie: DraftSpecie): string[] {
  const values = new Map<string, string>();
  for (const immunity of specie.getImmune()) {
    const label = toDisplayLabel(immunity);
    if (!label) continue;
    values.set(label.toLowerCase(), label);
  }
  return [...values.values()];
}

const SEARCH_FIELD_DEFINITIONS = {
  id: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.id,
  },
  name: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.name,
  },
  fullname: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.fullname,
  },
  baseSpecies: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.baseSpecies,
  },
  num: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.num,
  },
  gen: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.gen,
  },
  tier: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.tier,
    ranker: rankTier,
  },
  natDexTier: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.natDexTier,
    ranker: rankTier,
  },
  doublesTier: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.doublesTier,
    ranker: rankTier,
  },
  isNonstandard: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.isNonstandard ?? "",
  },
  types: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => [...specie.types],
  },
  abilities: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => specie.getAbilities(),
  },
  eggGroups: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => [...specie.eggGroups],
  },
  weaks: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => specie.getWeak(),
  },
  resists: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => specie.getResists(),
  },
  immunities: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => getDisplayImmunities(specie),
  },
  tags: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => [...specie.tags],
  },
  weightkg: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.weightkg,
  },
  bst: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.bst,
  },
  cst: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.cst,
  },
  hp: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.baseStats.hp,
  },
  atk: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.baseStats.atk,
  },
  def: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.baseStats.def,
  },
  spa: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.baseStats.spa,
  },
  spd: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.baseStats.spd,
  },
  spe: {
    type: "number",
    resolver: (specie: DraftSpecie) => specie.baseStats.spe,
  },
  nfe: {
    type: "boolean",
    resolver: (specie: DraftSpecie) => specie.nfe,
  },
  evolved: {
    type: "boolean",
    resolver: (specie: DraftSpecie) => !specie.nfe,
  },
  isCosmeticForme: {
    type: "boolean",
    resolver: (specie: DraftSpecie) => Boolean(specie.isCosmeticForme),
  },
  isMega: {
    type: "boolean",
    resolver: (specie: DraftSpecie) => Boolean(specie.isMega),
  },
  isPrimal: {
    type: "boolean",
    resolver: (specie: DraftSpecie) => Boolean(specie.isPrimal),
  },
  isGigantamax: {
    type: "boolean",
    resolver: (specie: DraftSpecie) => Boolean(specie.isGigantamax),
  },
  prevo: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.prevo ?? "",
  },
  evos: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => specie.evos ?? [],
  },
  requiredAbility: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.requiredAbility ?? "",
  },
  requiredItem: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => getRequiredItemValues(specie),
  },
  requiredItems: {
    type: "string[]",
    resolver: (specie: DraftSpecie) => getRequiredItemValues(specie),
  },
  requiredMove: {
    type: "string",
    resolver: (specie: DraftSpecie) => specie.requiredMove ?? "",
  },
  learns: {
    type: "string[]",
    resolver: async (specie: DraftSpecie) => {
      const moves = await specie.learnset();
      const values = new Set<string>();
      for (const move of moves) {
        values.add(move.id);
        values.add(move.name);
      }
      return [...values];
    },
  },
  coverage: {
    type: "string[]",
    resolver: async (specie: DraftSpecie) => {
      const coverage = await specie.coverage();
      const values = new Set<string>();
      for (const move of [...coverage.physical, ...coverage.special]) {
        values.add(move.id);
        values.add(move.name);
        values.add(move.type);
      }
      return [...values];
    },
  },
} as const satisfies Record<string, FieldDefinition>;

type CanonicalField = keyof typeof SEARCH_FIELD_DEFINITIONS;

const MOVE_FIELD_DEFINITIONS: Record<MoveField, MoveFieldDefinition> = {
  id: {
    type: "string",
    resolver: (move: Move) => move.id as string,
  },
  name: {
    type: "string",
    resolver: (move: Move) => move.name,
  },
  type: {
    type: "string",
    resolver: (move: Move) => String(move.type),
  },
  category: {
    type: "string",
    resolver: (move: Move) => move.category ?? "Status",
  },
  basePower: {
    type: "number",
    resolver: (move: Move) => move.basePower,
  },
  accuracy: {
    type: "number",
    // accuracy === true means the move always hits; represent as 101 for numeric comparisons
    resolver: (move: Move) =>
      typeof move.accuracy === "number" ? move.accuracy : 101,
  },
  pp: {
    type: "number",
    resolver: (move: Move) => move.pp,
  },
  priority: {
    type: "number",
    resolver: (move: Move) => move.priority ?? 0,
  },
  target: {
    type: "string",
    resolver: (move: Move) => String(move.target ?? ""),
  },
};

const TIER_RANKS: Record<string, number> = {
  AG: 140,
  UBER: 130,
  OU: 120,
  UUBL: 110,
  UU: 100,
  RUBL: 90,
  RU: 80,
  NUBL: 70,
  NU: 60,
  PUBL: 50,
  PU: 40,
  ZUBL: 30,
  ZU: 20,
  NFE: 10,
  LC: 8,
  UNTIERED: 5,
  DUBER: 130,
  DOU: 120,
  DUU: 100,
  DRU: 80,
  DNU: 60,
  DPU: 40,
  ILLEGAL: -10,
  UNRELEASED: -20,
};

export function parseSearchRequest(
  input: string | SearchPokemonOptions,
): Required<SearchPokemonOptions> {
  return normalizeOptions(input);
}

export async function searchPokemon(
  ruleset: Ruleset,
  options: SearchPokemonOptions,
): Promise<DraftSpecie[]> {
  const result = await searchPokemonWithMetadata(ruleset, options);
  return result.results;
}

export async function searchPokemonWithMetadata(
  ruleset: Ruleset,
  options: SearchPokemonOptions,
): Promise<SearchPokemonResult> {
  const normalized = normalizeOptions(options);
  const sorted = await getSortedMatches(ruleset, normalized);
  const offset = Math.max(normalized.offset, 0);
  const limit = Math.max(normalized.limit, 0);

  return {
    results: paginateResults(sorted, limit, offset),
    total: sorted.length,
    limit,
    offset,
  };
}

async function getSortedMatches(
  ruleset: Ruleset,
  normalized: Required<SearchPokemonOptions>,
): Promise<DraftSpecie[]> {
  const baseSpecies = Array.from(ruleset.species)
    .map((specie) => new DraftSpecie(specie, ruleset))
    .sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));

  const shouldIncludeCosmetic = hasCosmeticSearch(normalized.searches);
  const filtered: DraftSpecie[] = [];
  for (const specie of baseSpecies) {
    if (!shouldIncludeCosmetic && specie.isCosmeticForme) continue;
    const fieldCache = new Map<CanonicalField, ResolvedFieldValue>();
    const passesSearches = await evaluateSearches(
      normalized.searches,
      normalized.mode,
      specie,
      fieldCache,
    );
    if (passesSearches) filtered.push(specie);
  }

  const sorted = await sortSpecies(
    filtered,
    normalized.sortBy,
    normalized.sortDirection,
  );
  return sorted;
}

function hasCosmeticSearch(searches: SearchExpression[]): boolean {
  for (const search of searches) {
    if (isSearchFilter(search)) {
      const canonicalField = toCanonicalField(search.field);
      if (canonicalField === "isCosmeticForme") return true;
      continue;
    }

    if (hasCosmeticSearch(search.searches ?? [])) return true;
  }
  return false;
}

function paginateResults(
  sorted: DraftSpecie[],
  limit: number,
  offset: number,
): DraftSpecie[] {
  if (!limit) return sorted.slice(offset);
  return sorted.slice(offset, offset + limit);
}

function normalizeOptions(
  options: string | SearchPokemonOptions,
): Required<SearchPokemonOptions> {
  return typeof options === "string"
    ? parseOptionsString(options)
    : parseStructuredOptions(options);
}

function parseOptionsString(raw: string): Required<SearchPokemonOptions> {
  const input = raw.trim();
  if (!input) return getDefaultOptions();

  try {
    const parsed = JSON.parse(input) as unknown;
    return parseStructuredOptions(parsed);
  } catch {
    return getDefaultOptions();
  }
}

function parseStructuredOptions(
  parsed: unknown,
): Required<SearchPokemonOptions> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return getDefaultOptions();
  }

  const value = parsed as Partial<SearchPokemonOptions>;
  return {
    searches: Array.isArray(value.searches)
      ? value.searches.filter(isSearchExpression)
      : [],
    mode: value.mode === "or" ? "or" : "and",
    sortBy: typeof value.sortBy === "string" ? value.sortBy : "num",
    sortDirection: value.sortDirection === "desc" ? "desc" : "asc",
    limit:
      typeof value.limit === "number" && Number.isFinite(value.limit)
        ? value.limit
        : 0,
    offset:
      typeof value.offset === "number" && Number.isFinite(value.offset)
        ? value.offset
        : 0,
  };
}

function getDefaultOptions(): Required<SearchPokemonOptions> {
  return {
    searches: [],
    mode: "and",
    sortBy: "num",
    sortDirection: "asc",
    limit: 0,
    offset: 0,
  };
}

function isSearchFilter(value: unknown): value is SearchFilter {
  if (!value || typeof value !== "object") return false;
  const filter = value as Partial<SearchFilter>;
  if (typeof filter.field !== "string") return false;
  if (typeof filter.operator !== "string") return false;

  const hasValue =
    filter.value !== undefined &&
    (typeof filter.value === "string" ||
      typeof filter.value === "number" ||
      typeof filter.value === "boolean" ||
      (Array.isArray(filter.value) &&
        filter.value.every(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        )));

  const hasMoveFilters =
    Array.isArray(filter.moveFilters) && filter.moveFilters.every(isMoveFilter);

  return hasValue || hasMoveFilters;
}

function isSearchGroup(value: unknown): value is SearchGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<SearchGroup>;

  if (group.mode !== undefined && group.mode !== "and" && group.mode !== "or") {
    return false;
  }

  if (!Array.isArray(group.searches)) return false;
  return group.searches.every(isSearchExpression);
}

function isSearchExpression(value: unknown): value is SearchExpression {
  return isSearchFilter(value) || isSearchGroup(value);
}

function isMoveFilter(value: unknown): value is MoveFilter {
  if (!value || typeof value !== "object") return false;
  const filter = value as Partial<MoveFilter>;
  return (
    typeof filter.field === "string" &&
    typeof filter.operator === "string" &&
    (typeof filter.value === "string" ||
      typeof filter.value === "number" ||
      typeof filter.value === "boolean" ||
      (Array.isArray(filter.value) &&
        filter.value.every(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        )))
  );
}

async function evaluateSearches(
  searches: SearchExpression[],
  mode: SearchLogicalMode,
  specie: DraftSpecie,
  fieldCache: Map<CanonicalField, ResolvedFieldValue>,
): Promise<boolean> {
  if (!searches.length) return true;
  if (mode === "or") {
    for (const search of searches) {
      if (await evaluateSearchExpression(search, specie, fieldCache))
        return true;
    }
    return false;
  }

  for (const search of searches) {
    if (!(await evaluateSearchExpression(search, specie, fieldCache)))
      return false;
  }
  return true;
}

async function evaluateSearchExpression(
  search: SearchExpression,
  specie: DraftSpecie,
  fieldCache: Map<CanonicalField, ResolvedFieldValue>,
): Promise<boolean> {
  if (isSearchFilter(search)) {
    return evaluateFilter(search, specie, fieldCache);
  }

  return evaluateSearches(
    search.searches ?? [],
    search.mode ?? "and",
    specie,
    fieldCache,
  );
}

async function evaluateFilter(
  filter: SearchFilter,
  specie: DraftSpecie,
  fieldCache: Map<CanonicalField, ResolvedFieldValue>,
): Promise<boolean> {
  const canonicalField = toCanonicalField(filter.field);
  if (!canonicalField) return false;

  if (filter.moveFilters?.length && canonicalField === "learns") {
    return evaluateMoveSubFilters(
      filter.moveFilters,
      filter.moveMode ?? "and",
      specie,
    );
  }

  if (filter.value === undefined) return false;
  const definition = SEARCH_FIELD_DEFINITIONS[canonicalField];
  const fieldValue = await getFieldValue(canonicalField, specie, fieldCache);
  if (fieldValue === undefined) return false;

  return compareFilterValues(
    fieldValue,
    definition,
    filter.operator,
    normalizeFilterValue(filter.value, definition.type),
  );
}

async function getFieldValue(
  field: CanonicalField,
  specie: DraftSpecie,
  fieldCache: Map<CanonicalField, ResolvedFieldValue>,
): Promise<ResolvedFieldValue> {
  if (fieldCache.has(field)) return fieldCache.get(field);
  const value = await SEARCH_FIELD_DEFINITIONS[field].resolver(specie);
  fieldCache.set(field, value);
  return value;
}

function toCanonicalField(field: string): CanonicalField | undefined {
  const normalized = field.trim();
  if (normalized in SEARCH_FIELD_DEFINITIONS) {
    return normalized as CanonicalField;
  }
  return undefined;
}

function normalizeFilterValue(
  value: SearchValue,
  type: FieldType,
): SearchValue {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceToType(item, type))
      .filter((item): item is Primitive => item !== undefined);
  }
  return coerceToType(value, type) ?? value;
}

function coerceToType(
  value: Primitive,
  type: FieldType,
): Primitive | undefined {
  if (type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1", "fully evolved"].includes(normalized)) {
        return true;
      }
      if (["false", "no", "0", "unevolved"].includes(normalized)) {
        return false;
      }
    }
    return undefined;
  }

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function compareFilterValues(
  fieldValue: ResolvedFieldValue,
  definition: FieldBase,
  operator: SearchOperator,
  filterValue: SearchValue,
): boolean {
  if (fieldValue === undefined) return false;

  switch (operator) {
    case "eq":
      return compareEquals(fieldValue, filterValue, definition);
    case "ne":
      return !compareEquals(fieldValue, filterValue, definition);
    case "gt":
      return compareOrdered(fieldValue, filterValue, definition) > 0;
    case "gte":
      return compareOrdered(fieldValue, filterValue, definition) >= 0;
    case "lt":
      return compareOrdered(fieldValue, filterValue, definition) < 0;
    case "lte":
      return compareOrdered(fieldValue, filterValue, definition) <= 0;
    case "contains":
      return compareContains(fieldValue, filterValue, definition);
    case "notContains":
      return !compareContains(fieldValue, filterValue, definition);
    case "in":
      return compareIn(fieldValue, filterValue, definition);
    case "nin":
      return !compareIn(fieldValue, filterValue, definition);
    default:
      return false;
  }
}

function compareEquals(
  fieldValue: ResolvedFieldValue,
  filterValue: SearchValue,
  definition: FieldBase,
): boolean {
  if (fieldValue === undefined) return false;
  if (Array.isArray(fieldValue)) {
    if (Array.isArray(filterValue)) {
      if (fieldValue.length !== filterValue.length) return false;
      const left = fieldValue
        .map((value) => normalizeString(String(value)))
        .sort();
      const right = filterValue
        .map((value) => normalizeString(String(value)))
        .sort();
      return left.every((value, index) => value === right[index]);
    }
    return fieldValue.some((value) =>
      compareScalar(value, filterValue, definition),
    );
  }

  if (Array.isArray(filterValue)) {
    return filterValue.some((value) =>
      compareScalar(fieldValue, value, definition),
    );
  }

  return compareScalar(fieldValue, filterValue, definition);
}

function compareOrdered(
  fieldValue: ResolvedFieldValue,
  filterValue: SearchValue,
  definition: FieldBase,
): number {
  if (Array.isArray(fieldValue) || Array.isArray(filterValue)) {
    return Number.NaN;
  }

  if (definition.ranker) {
    const left = definition.ranker(String(fieldValue));
    const right = definition.ranker(String(filterValue));
    if (left === undefined || right === undefined) return Number.NaN;
    return left - right;
  }

  if (definition.type === "number") {
    const left = Number(fieldValue);
    const right = Number(filterValue);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
    return left - right;
  }

  const left = normalizeString(String(fieldValue));
  const right = normalizeString(String(filterValue));
  return left.localeCompare(right);
}

function compareContains(
  fieldValue: ResolvedFieldValue,
  filterValue: SearchValue,
  definition: FieldBase,
): boolean {
  if (fieldValue === undefined) return false;
  if (Array.isArray(fieldValue)) {
    if (Array.isArray(filterValue)) {
      return filterValue.every((searchValue) =>
        fieldValue.some((fieldItem) =>
          compareScalar(fieldItem, searchValue, definition),
        ),
      );
    }
    return fieldValue.some((fieldItem) =>
      compareScalar(fieldItem, filterValue, definition),
    );
  }

  if (Array.isArray(filterValue)) {
    return filterValue.every((searchValue) =>
      compareContains(fieldValue, searchValue, definition),
    );
  }

  if (definition.type === "string" || definition.type === "string[]") {
    return normalizeString(String(fieldValue)).includes(
      normalizeString(String(filterValue)),
    );
  }

  return compareScalar(fieldValue, filterValue, definition);
}

function compareIn(
  fieldValue: ResolvedFieldValue,
  filterValue: SearchValue,
  definition: FieldBase,
): boolean {
  if (fieldValue === undefined) return false;
  const values = Array.isArray(filterValue) ? filterValue : [filterValue];
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((fieldItem) =>
      values.some((searchValue) =>
        compareScalar(fieldItem, searchValue, definition),
      ),
    );
  }
  return values.some((searchValue) =>
    compareScalar(fieldValue, searchValue, definition),
  );
}

function compareScalar(
  left: Primitive,
  right: Primitive,
  definition: FieldBase,
): boolean {
  if (definition.type === "number") {
    return Number(left) === Number(right);
  }

  if (definition.type === "boolean") {
    return Boolean(left) === Boolean(right);
  }

  return normalizeString(String(left)) === normalizeString(String(right));
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function rankTier(value: string): number | undefined {
  const normalized = value
    .toUpperCase()
    .replace(/\([^)]*\)/g, (match) => match.replace(/[^A-Z0-9]/g, ""))
    .replace(/[^A-Z0-9]/g, "");
  if (!normalized) return undefined;
  return TIER_RANKS[normalized] ?? undefined;
}

async function sortSpecies(
  species: DraftSpecie[],
  sortBy: string,
  sortDirection: SearchSortDirection,
): Promise<DraftSpecie[]> {
  const canonicalField = toCanonicalField(sortBy);
  if (!canonicalField) return species;

  const definition = SEARCH_FIELD_DEFINITIONS[canonicalField];
  const decorated = await Promise.all(
    species.map(async (specie) => ({
      specie,
      value: await definition.resolver(specie),
    })),
  );
  const direction = sortDirection === "desc" ? -1 : 1;
  decorated.sort((a, b) => {
    const left = normalizeSortableValue(a.value, definition);
    const right = normalizeSortableValue(b.value, definition);
    if (left > right) return 1 * direction;
    if (left < right) return -1 * direction;
    return a.specie.name.localeCompare(b.specie.name);
  });
  return decorated.map((entry) => entry.specie);
}

function normalizeSortableValue(
  value: ResolvedFieldValue,
  definition: FieldBase,
): number | string {
  if (value === undefined) return Number.NEGATIVE_INFINITY;
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry))
      .sort()
      .join("|");
  }
  if (definition.type === "number") return Number(value);
  if (definition.type === "boolean") return value ? 1 : 0;
  if (definition.ranker) {
    return definition.ranker(String(value)) ?? Number.NEGATIVE_INFINITY;
  }
  return normalizeString(String(value));
}

async function evaluateMoveSubFilters(
  moveFilters: MoveFilter[],
  mode: SearchLogicalMode,
  specie: DraftSpecie,
): Promise<boolean> {
  const moves = await specie.learnset();
  for (const move of moves) {
    const passes =
      mode === "or"
        ? moveFilters.some((f) => evaluateSingleMoveFilter(move, f))
        : moveFilters.every((f) => evaluateSingleMoveFilter(move, f));
    if (passes) return true;
  }
  return false;
}

function toCanonicalMoveField(field: string): MoveCanonicalField | undefined {
  const normalized = field.trim();
  if (normalized in MOVE_FIELD_DEFINITIONS) {
    return normalized as MoveCanonicalField;
  }
  return undefined;
}

function evaluateSingleMoveFilter(move: Move, filter: MoveFilter): boolean {
  const canonicalField = toCanonicalMoveField(filter.field);
  if (!canonicalField) return false;
  const definition = MOVE_FIELD_DEFINITIONS[canonicalField];
  const fieldValue = definition.resolver(move);
  if (fieldValue === undefined) return false;
  return compareFilterValues(
    fieldValue,
    definition,
    filter.operator,
    normalizeFilterValue(filter.value, definition.type),
  );
}
