import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { toID } from "@pkmn/data";
import { ImportAliasRepository, MAX_ALIASES_PER_USER } from "./import-alias.repository";
import { ImportPreviewDto, MAX_IMPORT_TEXT, SaveImportAliasesDto } from "./import.dto";
import {
  detectLayouts,
  ImportedEntry,
  isUntieredHeading,
  LAYOUT_LABELS,
  LayoutId,
  LayoutResult,
} from "./layouts";
import { NameMatch, NameMatcher } from "./name-matcher";
import { parseSheet } from "./sheet-parser";

const SHEET_URL =
  /^https:\/\/docs\.google\.com\/spreadsheets\/d\/(e\/)?([A-Za-z0-9_-]{10,})/;
const FETCH_TIMEOUT_MS = 10_000;
const ALLOWED_HOSTS = /(^|\.)(docs\.google\.com|googleusercontent\.com)$/;

export type PreviewEntry = ImportedEntry & { match: NameMatch };

export type PreviewTier = {
  name: string;
  cost?: number;
  banned: boolean;
  untiered: boolean;
  entries: PreviewEntry[];
};

export function sheetExportUrl(url: string): string {
  const match = url.trim().match(SHEET_URL);
  if (!match)
    throw new PDZError(ErrorCodes.TIER_LIST.IMPORT_FAILED, {
      reason: "Paste a link to a Google Sheet (docs.google.com/spreadsheets/…).",
    });
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
  const published = !!match[1];
  const id = match[2];
  if (published)
    return `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv${gid ? `&gid=${gid}` : ""}`;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

@Injectable()
export class TierListImportService {
  constructor(private readonly aliasRepo: ImportAliasRepository) {}

  async fetchSheet(url: string): Promise<string> {
    const target = sheetExportUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(target, {
        redirect: "follow",
        signal: controller.signal,
      });
      const finalHost = new URL(response.url || target).hostname;
      if (!ALLOWED_HOSTS.test(finalHost))
        throw new PDZError(ErrorCodes.TIER_LIST.IMPORT_FAILED, {
          reason: "That link didn't lead to a Google Sheet.",
        });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || type.includes("text/html"))
        throw new PDZError(ErrorCodes.TIER_LIST.IMPORT_FAILED, {
          reason:
            "That sheet isn't shared publicly. Set it to anyone with the link, or copy the cells and paste them instead.",
        });
      const text = await response.text();
      if (text.length > MAX_IMPORT_TEXT)
        throw new PDZError(ErrorCodes.TIER_LIST.IMPORT_FAILED, {
          reason: "That sheet is too big to import. Paste just the tier list cells.",
        });
      return text;
    } catch (error) {
      if (error instanceof PDZError) throw error;
      throw new PDZError(ErrorCodes.TIER_LIST.IMPORT_FAILED, {
        reason: "Could not reach that sheet. Paste the cells instead.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async preview(dto: ImportPreviewDto, sub: string) {
    getFormat(dto.format);
    const ruleset = getRuleset(dto.ruleset);
    const text = dto.url ? await this.fetchSheet(dto.url) : (dto.text ?? "");
    if (!text.trim())
      throw new PDZError(ErrorCodes.TIER_LIST.IMPORT_FAILED, {
        reason: "There's nothing to import. Paste the cells from your sheet.",
      });

    const rows = parseSheet(text);
    const remembered = await this.aliasRepo.forOwner(sub);
    const matcher = new NameMatcher(ruleset, remembered);
    const cache = new Map<string, NameMatch>();
    const matchOf = (cell: string) => {
      let found = cache.get(cell);
      if (!found) {
        found = matcher.match(cell);
        cache.set(cell, found);
      }
      return found;
    };
    const strict = (cell: string) => {
      const found = matchOf(cell);
      return (
        (found.status === "matched" && found.via !== "spelling") ||
        found.status === "not-in-ruleset"
      );
    };
    const loose = (cell: string) => matchOf(cell).status !== "unmatched";

    const layouts = detectLayouts(rows, { strict, loose });
    if (!layouts.length)
      throw new PDZError(ErrorCodes.TIER_LIST.IMPORT_FAILED, {
        reason:
          "Couldn't find tiers in that sheet. Include the tier names (or costs) with the Pokémon.",
      });
    const chosen: LayoutResult =
      layouts.find((layout) => layout.layout === dto.layout) ?? layouts[0];

    const tiers: PreviewTier[] = chosen.tiers.map((tier) => ({
      name: tier.name,
      cost: tier.cost,
      banned: tier.banned,
      untiered: isUntieredHeading(tier.name),
      entries: tier.entries.map((entry) => ({ ...entry, match: { ...matchOf(entry.text) } })),
    }));

    const all = tiers.flatMap((tier) => tier.entries);
    matcher.flagUnspecifiedFormes(all);

    const placements = new Map<string, number[]>();
    tiers.forEach((tier, index) => {
      for (const entry of tier.entries)
        if (entry.match.status === "matched")
          for (const option of entry.match.pokemon) {
            const list = placements.get(option.id) ?? [];
            if (!list.includes(index)) list.push(index);
            placements.set(option.id, list);
          }
    });
    const duplicates = [...placements.entries()]
      .filter(([, indexes]) => indexes.length > 1)
      .map(([pokemonId, indexes]) => ({
        pokemonId,
        name: matcher.option(pokemonId)?.name ?? pokemonId,
        tiers: indexes,
      }));

    const count = (status: string) =>
      all.filter((entry) => entry.match.status === status).length;

    return {
      layout: chosen.layout,
      layouts: layouts.map((layout) => ({
        id: layout.layout as LayoutId,
        label: LAYOUT_LABELS[layout.layout],
        tierCount: layout.tiers.length,
      })),
      tiers,
      duplicates,
      counts: {
        total: all.length,
        matched: count("matched"),
        suggested: count("suggested"),
        ambiguous: count("ambiguous"),
        notInRuleset: count("not-in-ruleset"),
        unmatched: count("unmatched"),
        duplicates: duplicates.length,
      },
      rememberedCount: remembered.size,
    };
  }

  async saveAliases(sub: string, dto: SaveImportAliasesDto) {
    const entries = dto.entries
      .map((entry) => ({
        text: toID(entry.text),
        pokemonIds: [...new Set(entry.pokemonIds.map((id) => toID(id)))].filter(Boolean),
      }))
      .filter((entry) => entry.text && entry.pokemonIds.length);
    const existing = await this.aliasRepo.count(sub);
    if (existing + entries.length > MAX_ALIASES_PER_USER)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "You have too many remembered names. Clear them and start again.",
      });
    await this.aliasRepo.upsertMany(sub, entries);
    return { saved: entries.length };
  }

  async clearAliases(sub: string) {
    return { cleared: await this.aliasRepo.clear(sub) };
  }
}
