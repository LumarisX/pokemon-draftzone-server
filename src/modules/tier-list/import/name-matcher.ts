import { Ruleset } from "@core/data/rulesets/rulesets";
import { toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export type MatchStatus =
  | "matched"
  | "suggested"
  | "ambiguous"
  | "not-in-ruleset"
  | "unmatched";

export type MatchOption = { id: string; name: string };

export type NameMatch = {
  status: MatchStatus;
  pokemon: MatchOption[];
  options?: MatchOption[];
  via?: "exact" | "alias" | "forme" | "remembered" | "spelling";
};

const REGIONS: [RegExp, string][] = [
  [/^alolan\s+(.+)$/i, "$1-Alola"],
  [/^galarian\s+(.+)$/i, "$1-Galar"],
  [/^hisuian\s+(.+)$/i, "$1-Hisui"],
  [/^paldean\s+(.+)$/i, "$1-Paldea"],
];

const FORME_SPELLINGS: [RegExp, string][] = [
  [/^rapid[\s-]*strike\s+(.+)$/i, "$1-Rapid-Strike"],
  [/^single[\s-]*strike\s+(.+)$/i, "$1"],
  [/^(urshifu)[\s-]+r(apid)?$/i, "$1-Rapid-Strike"],
  [/^(urshifu)[\s-]+s(ingle)?$/i, "$1"],
  [/^(.+?)[\s-]+r[\s-]*s$/i, "$1-Rapid-Strike"],
  [/^therian\s+(.+)$/i, "$1-Therian"],
  [/^incarnate\s+(.+)$/i, "$1"],
  [/^(.+?)[\s-]+i(ncarnate)?$/i, "$1"],
  [/^shadow\s+rider\s+(.+)$/i, "$1-Shadow"],
  [/^ice\s+rider\s+(.+)$/i, "$1-Ice"],
  [/^(.+?)\s*\(\s*(.+?)\s*(forme?|mask|mode|form|style|strike)?\s*\)$/i, "$1-$2"],
  [/^(\S+)\s+(\S+)$/, "$2-$1"],
];

const LABEL = /^[^:]{1,24}:\s*(.+)$/;
const NOTE_IN_BRACKETS = /\s*[([{][^)\]}]*[)\]}]\s*/g;
const MARKERS = /[*†‡^#~]+|\s+\d+$/g;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function variants(raw: string): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const trimmed = clean(value);
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };

  const base = clean(raw);
  push(base);
  const unmarked = base.replace(MARKERS, "");
  push(unmarked);
  const labelled = unmarked.match(LABEL);
  if (labelled) push(labelled[1]);

  for (const candidate of [...out]) {
    for (const [pattern, replacement] of [...REGIONS, ...FORME_SPELLINGS])
      if (pattern.test(candidate)) push(candidate.replace(pattern, replacement));
    push(candidate.replace(NOTE_IN_BRACKETS, " "));
  }
  return out;
}

function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        table[i - 1][j] + 1,
        table[i][j - 1] + 1,
        table[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, table[i - 2][j - 2] + 1);
      table[i][j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
  }
  return table[a.length][b.length];
}

const SKIPPED_FORMES = /^(Gmax|Totem|.*Mega.*|Primal)$/;

export class NameMatcher {
  private readonly speciesIds: { id: string; name: string }[];
  private readonly formesByBase = new Map<string, MatchOption[]>();

  constructor(
    private readonly ruleset: Ruleset,
    private readonly remembered: Map<string, string[]> = new Map(),
  ) {
    this.speciesIds = Array.from(ruleset.species).map((specie) => ({
      id: specie.id,
      name: specie.name,
    }));
    for (const specie of ruleset.species) {
      const baseId = toID(specie.baseSpecies);
      const list = this.formesByBase.get(baseId) ?? [];
      list.push({ id: specie.id, name: specie.name });
      this.formesByBase.set(baseId, list);
    }
  }

  option(id: string): MatchOption | null {
    const specie = this.ruleset.species.get(id);
    return specie ? { id: specie.id, name: specie.name } : null;
  }

  private resolve(text: string): MatchOption | null {
    const specie = this.ruleset.species.get(text);
    return specie ? { id: specie.id, name: specie.name } : null;
  }

  draftableFormes(id: string): MatchOption[] {
    const specie = this.ruleset.species.get(id);
    if (!specie) return [];
    return (this.formesByBase.get(toID(specie.baseSpecies)) ?? []).filter(
      (option) => {
        const forme = this.ruleset.species.get(option.id);
        if (!forme) return false;
        if (forme.battleOnly) return false;
        return !SKIPPED_FORMES.test(forme.forme ?? "");
      },
    );
  }

  private prefixMatches(text: string): MatchOption[] {
    const id = toID(text);
    if (id.length < 4) return [];
    return this.speciesIds.filter(
      (entry) =>
        entry.id.startsWith(id) &&
        this.draftableFormes(entry.id).some((option) => option.id === entry.id),
    );
  }

  match(raw: string): NameMatch {
    const key = toID(raw);
    const remembered = this.remembered.get(key);
    if (remembered?.length) {
      const pokemon = remembered
        .map((id) => this.option(id))
        .filter((option): option is MatchOption => !!option);
      if (pokemon.length)
        return { status: "matched", pokemon, via: "remembered" };
    }

    const candidates = variants(raw);
    for (const [index, candidate] of candidates.entries()) {
      const found = this.resolve(candidate);
      if (found) {
        const via =
          index === 0
            ? toID(candidate) === found.id
              ? "exact"
              : "alias"
            : "forme";
        return { status: "matched", pokemon: [found], via };
      }
    }

    for (const candidate of candidates) {
      const prefixed = this.prefixMatches(candidate);
      if (prefixed.length > 1)
        return { status: "ambiguous", pokemon: [], options: prefixed.slice(0, 8) };
      if (prefixed.length === 1)
        return { status: "suggested", pokemon: prefixed, via: "spelling" };
    }

    for (const candidate of candidates) {
      const anywhere = Dex.species.get(candidate);
      if (anywhere?.exists)
        return {
          status: "not-in-ruleset",
          pokemon: [{ id: anywhere.id, name: anywhere.name }],
        };
    }

    const target = toID(candidates[candidates.length > 1 ? 1 : 0]);
    if (target.length >= 4) {
      const limit = target.length < 7 ? 1 : 2;
      const scored = this.speciesIds
        .map((entry) => ({ entry, score: distance(target, entry.id, limit) }))
        .filter(({ score }) => score <= limit)
        .sort((a, b) => a.score - b.score);
      if (scored.length) {
        const best = scored[0].score;
        const tied = scored.filter(({ score }) => score === best);
        if (tied.length === 1)
          return { status: "suggested", pokemon: [tied[0].entry], via: "spelling" };
        return {
          status: "ambiguous",
          pokemon: [],
          options: tied.slice(0, 6).map(({ entry }) => entry),
        };
      }
    }

    return { status: "unmatched", pokemon: [] };
  }

  flagUnspecifiedFormes(
    matches: { match: NameMatch }[],
  ): void {
    const present = new Set(
      matches.flatMap(({ match }) => match.pokemon.map((option) => option.id)),
    );
    for (const entry of matches) {
      const { match } = entry;
      if (match.status !== "matched" || match.via === "remembered") continue;
      if (match.pokemon.length !== 1) continue;
      const [only] = match.pokemon;
      const specie = this.ruleset.species.get(only.id);
      if (!specie || specie.name !== specie.baseSpecies) continue;
      const others = this.draftableFormes(only.id).filter(
        (option) => option.id !== only.id,
      );
      if (!others.length || others.some((option) => present.has(option.id)))
        continue;
      entry.match = {
        status: "ambiguous",
        pokemon: [only],
        options: [only, ...others].slice(0, 8),
      };
    }
  }
}
