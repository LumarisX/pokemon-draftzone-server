import { ID, toID } from "@pkmn/data";
import { LRUCache } from "lru-cache";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset, getRulesets, Ruleset, Rulesets } from "../data/rulesets";

const DEFAULT_RULESET_ID = "Gen9 NatDex";
const MAX_SPECIES_CONTEXT = 4;
const MAX_CONTEXT_CHARS = 3200;
const MAX_TYPE_PREVIEW = 12;

const SPECIES_ALIAS_CACHE = new LRUCache<string, Map<string, ID>>({ max: 32 });
let rulesetAliasIndex: Map<string, string> | null = null;

const normalizeLoose = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeTight = (value: string) =>
  normalizeLoose(value).replace(/\s+/g, "");

function addAlias(index: Map<string, ID>, alias: string, id: ID) {
  if (!alias) return;
  if (!index.has(alias)) {
    index.set(alias, id);
  }
}

function getSpeciesAliasIndex(ruleset: Ruleset): Map<string, ID> {
  const cached = SPECIES_ALIAS_CACHE.get(ruleset.name);
  if (cached) return cached;

  const index = new Map<string, ID>();
  for (const specie of ruleset.species) {
    const baseAliases = [
      specie.id,
      specie.name,
      specie.name.replace(/-/g, " "),
      specie.baseSpecies,
      specie.baseSpecies.replace(/-/g, " "),
    ];

    for (const alias of baseAliases) {
      const raw = alias.trim();
      addAlias(index, raw.toLowerCase(), specie.id);
      addAlias(index, normalizeLoose(raw), specie.id);
      addAlias(index, normalizeTight(raw), specie.id);
      addAlias(index, toID(raw), specie.id);
    }
  }

  SPECIES_ALIAS_CACHE.set(ruleset.name, index);
  return index;
}

function getRulesetAliasIndex(): Map<string, string> {
  if (rulesetAliasIndex) return rulesetAliasIndex;

  const index = new Map<string, string>();
  const ids = getRulesets();
  for (const id of ids) {
    const aliases = [id, id.replace(/\s+/g, "")];
    for (const alias of aliases) {
      index.set(normalizeLoose(alias), id);
      index.set(normalizeTight(alias), id);
      index.set(alias.toLowerCase(), id);
    }
  }

  rulesetAliasIndex = index;
  return rulesetAliasIndex;
}

export function resolveRulesetIdFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return DEFAULT_RULESET_ID;

  const index = getRulesetAliasIndex();
  const direct =
    index.get(trimmed.toLowerCase()) ||
    index.get(normalizeLoose(trimmed)) ||
    index.get(normalizeTight(trimmed));
  if (direct) return direct;

  const cleaned = normalizeLoose(trimmed);
  for (const [alias, id] of index.entries()) {
    if (alias.length >= 6 && cleaned.includes(alias)) {
      return id;
    }
  }

  return DEFAULT_RULESET_ID;
}

export function resolveDraftSpecieByName(
  name: string,
  rulesetId = DEFAULT_RULESET_ID,
): DraftSpecie | null {
  const query = name.trim();
  if (!query) return null;

  let ruleset: Ruleset;
  try {
    ruleset = getRuleset(rulesetId);
  } catch {
    ruleset = getRuleset(DEFAULT_RULESET_ID);
  }

  const direct =
    ruleset.species.get(query) ||
    ruleset.species.get(toID(query)) ||
    ruleset.species.get(normalizeLoose(query)) ||
    ruleset.species.get(normalizeTight(query));

  if (direct) {
    return new DraftSpecie(direct, ruleset);
  }

  const aliasIndex = getSpeciesAliasIndex(ruleset);
  const aliases = [
    query.toLowerCase(),
    normalizeLoose(query),
    normalizeTight(query),
    toID(query),
  ];

  for (const alias of aliases) {
    const speciesId = aliasIndex.get(alias);
    if (!speciesId) continue;
    const resolved = ruleset.species.get(speciesId);
    if (resolved) {
      return new DraftSpecie(resolved, ruleset);
    }
  }

  return null;
}

function extractCandidateNames(text: string): string[] {
  const candidates = new Set<string>();

  const quoted = text.matchAll(/["“']([^"”']{2,40})["”']/g);
  for (const match of quoted) {
    const value = match[1].trim();
    if (value) candidates.add(value);
  }

  const normalized = normalizeLoose(text.replace(/<@!?\d+>/g, " "));
  const tokens = normalized.split(/\s+/).filter(Boolean).slice(0, 70);

  for (let size = 4; size >= 1; size -= 1) {
    for (let i = 0; i <= tokens.length - size; i += 1) {
      const value = tokens.slice(i, i + size).join(" ");
      if (value.length >= 3) {
        candidates.add(value);
      }
    }
  }

  return Array.from(candidates);
}

export function extractDraftSpeciesFromText(
  text: string,
  rulesetId = DEFAULT_RULESET_ID,
  maxSpecies = MAX_SPECIES_CONTEXT,
): DraftSpecie[] {
  const candidates = extractCandidateNames(text);
  const seen = new Set<ID>();
  const matches: DraftSpecie[] = [];

  for (const candidate of candidates) {
    const pokemon = resolveDraftSpecieByName(candidate, rulesetId);
    if (!pokemon || seen.has(pokemon.id)) continue;

    seen.add(pokemon.id);
    matches.push(pokemon);
    if (matches.length >= maxSpecies) break;
  }

  return matches;
}

function getRulesetDescription(rulesetId: string): string | undefined {
  for (const group of Object.values(Rulesets)) {
    for (const entry of Object.values(group)) {
      if (entry.id === rulesetId && entry.desc) return entry.desc;
    }
  }
  return undefined;
}

function buildRulesetContextLines(ruleset: Ruleset): string[] {
  const types = Array.from(ruleset.types).map((type) => type.name);
  const restriction = ruleset.restriction || "None";
  const category = ruleset.isNatDex ? "National Dex" : "Restricted Dex";
  const hasStellar = types.includes("Stellar");
  const rulesetDesc = getRulesetDescription(ruleset.name);
  const speciesCount = Array.from(ruleset.species).length;
  const moveCount = Array.from(ruleset.moves).length;
  const abilityCount = Array.from(ruleset.abilities).length;
  const itemCount = Array.from(ruleset.items).length;
  const typePreview =
    types.length > MAX_TYPE_PREVIEW
      ? `${types.slice(0, MAX_TYPE_PREVIEW).join(", ")}...`
      : types.join(", ");

  return [
    `Ruleset: ${ruleset.name}`,
    `Ruleset Category: ${category} | Gen: ${ruleset.num} | Restriction: ${restriction}`,
    `Ruleset Description: ${rulesetDesc || "No description available."}`,
    `Data Pools: Species ${speciesCount}, Moves ${moveCount}, Abilities ${abilityCount}, Items ${itemCount}`,
    `Type Pool (${types.length}): ${typePreview}`,
    `Mechanics Hints: Stellar ${hasStellar ? "available" : "not available"}, Tera types default to active ruleset type pool`,
  ];
}

const formatCoverage = (
  moves: { name: string; type: string; cPower: number }[],
  limit = 3,
) => {
  const top = moves
    .filter((move) => move.cPower >= 0)
    .sort((a, b) => b.cPower - a.cPower)
    .slice(0, limit)
    .map((move) => `${move.name} (${move.type})`);
  return top.length ? top.join(", ") : "None";
};

export async function buildPokemonDraftContext(
  text: string,
  options?: {
    rulesetId?: string;
    maxSpecies?: number;
    maxChars?: number;
  },
): Promise<string> {
  const rulesetId = options?.rulesetId || resolveRulesetIdFromText(text);
  const ruleset = getRuleset(rulesetId);
  const species = extractDraftSpeciesFromText(
    text,
    rulesetId,
    options?.maxSpecies || MAX_SPECIES_CONTEXT,
  );

  const lines: string[] = [
    "Pokemon Draft Knowledge Context:",
    ...buildRulesetContextLines(ruleset),
  ];

  if (species.length === 0) {
    lines.push(
      "No specific Pokémon were confidently detected from the conversation.",
    );
    return lines.join("\n");
  }

  for (const pokemon of species) {
    try {
      const learnset = await pokemon.learnset();
      const coverage = await pokemon.coverage();

      lines.push(
        `- ${pokemon.name} [${pokemon.id}] | Types: ${pokemon.types.join("/")} | Tier: ${pokemon.tier} | Doubles: ${pokemon.doublesTier}`,
      );
      lines.push(
        `  Stats: HP ${pokemon.baseStats.hp}, Atk ${pokemon.baseStats.atk}, Def ${pokemon.baseStats.def}, SpA ${pokemon.baseStats.spa}, SpD ${pokemon.baseStats.spd}, Spe ${pokemon.baseStats.spe} | BST ${pokemon.bst} | CST ${pokemon.cst}`,
      );
      lines.push(
        `  Abilities: ${pokemon.getAbilities().filter(Boolean).join(", ")}`,
      );
      lines.push(`  Weak: ${pokemon.getWeak().join(", ") || "None"}`);
      lines.push(`  Resist: ${pokemon.getResists().join(", ") || "None"}`);
      lines.push(`  Immune: ${pokemon.getImmune().join(", ") || "None"}`);
      lines.push(`  Learnset Size: ${learnset.length}`);
      lines.push(
        `  Top Physical Coverage: ${formatCoverage(coverage.physical as { name: string; type: string; cPower: number }[])}`,
      );
      lines.push(
        `  Top Special Coverage: ${formatCoverage(coverage.special as { name: string; type: string; cPower: number }[])}`,
      );
    } catch {
      lines.push(
        `- ${pokemon.name} [${pokemon.id}] | Context unavailable due to a temporary analysis issue.`,
      );
    }
  }

  const context = lines.join("\n");
  const maxChars = options?.maxChars || MAX_CONTEXT_CHARS;
  return context.length <= maxChars
    ? context
    : `${context.slice(0, maxChars)}\n...[context truncated]`;
}
