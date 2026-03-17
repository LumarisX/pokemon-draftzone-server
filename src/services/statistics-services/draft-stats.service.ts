import NodeCache from "node-cache";
import { PipelineStage } from "mongoose";
import { DraftData, DraftModel } from "../../models/draft/draft.model";

const DRAFT_STATS_TTL_SECONDS = 60 * 60 * 24;
const draftStatsCache = new NodeCache({ stdTTL: DRAFT_STATS_TTL_SECONDS });

export type DraftStatsSplitBy =
  | "none"
  | "format"
  | "ruleset"
  | "format-ruleset";

export type PokemonDraftBreakdown = {
  format?: string;
  ruleset?: string;
  count: number;
};

export type PokemonDraftCount = {
  id: string;
  count: number;
  breakdown?: PokemonDraftBreakdown[];
};

export type DraftStatsOptions = {
  format?: string;
  ruleset?: string;
  splitBy?: DraftStatsSplitBy;
};

export type DraftStatsResponse = {
  filters: {
    format?: string;
    ruleset?: string;
  };
  splitBy: DraftStatsSplitBy;
  totalTeams: number;
  sortedPokemon: PokemonDraftCount[];
  draftedPokemonCount: number;
  uniquePokemonCount: number;
};

type SplitAggregateRow = {
  _id: string;
  total: number;
  breakdown: Array<{ format: string; ruleset: string; count: number }>;
};

export function invalidateDraftStatsCache(): void {
  draftStatsCache.flushAll();
}

function buildMatchFilter(options: DraftStatsOptions): {
  format?: string;
  ruleset?: string;
} {
  const filter: { format?: string; ruleset?: string } = {};
  if (options.format) filter.format = options.format;
  if (options.ruleset) filter.ruleset = options.ruleset;
  return filter;
}

function buildBreakdown(
  splitBy: DraftStatsSplitBy,
  raw: Array<{ format: string; ruleset: string; count: number }>,
): PokemonDraftBreakdown[] {
  return raw
    .map(({ format, ruleset, count }) => {
      if (splitBy === "format") return { format, count };
      if (splitBy === "ruleset") return { ruleset, count };
      return { format, ruleset, count };
    })
    .sort((a, b) => b.count - a.count);
}

function buildDraftStatsCacheKey(
  options: DraftStatsOptions,
  splitBy: DraftStatsSplitBy,
): string {
  return JSON.stringify({
    format: options.format ?? null,
    ruleset: options.ruleset ?? null,
    splitBy,
  });
}

export async function getDraftStats(
  options: DraftStatsOptions = {},
): Promise<DraftStatsResponse> {
  const splitBy = options.splitBy ?? "none";
  const cacheKey = buildDraftStatsCacheKey(options, splitBy);
  const cached = draftStatsCache.get<DraftStatsResponse>(cacheKey);
  if (cached) return cached;

  const matchFilter = buildMatchFilter(options);

  const pipeline: PipelineStage[] = [
    { $match: matchFilter },
    {
      $project: {
        format: 1,
        ruleset: 1,
        teamPokemonIds: { $setUnion: [[], "$team.id"] },
      },
    },
    { $unwind: "$teamPokemonIds" },
    {
      $group: {
        _id: {
          format: "$format",
          ruleset: "$ruleset",
          pokemonId: "$teamPokemonIds",
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.pokemonId",
        total: { $sum: "$count" },
        breakdown: {
          $push: {
            format: "$_id.format",
            ruleset: "$_id.ruleset",
            count: "$count",
          },
        },
      },
    },
    { $sort: { total: -1, _id: 1 } },
  ];

  const [rows, totalTeams] = await Promise.all([
    DraftModel.aggregate<SplitAggregateRow>(pipeline),
    DraftModel.countDocuments(matchFilter),
  ]);

  const sortedPokemon: PokemonDraftCount[] = rows.map((row) => ({
    id: row._id,
    count: row.total,
    ...(splitBy !== "none" && {
      breakdown: buildBreakdown(splitBy, row.breakdown),
    }),
  }));

  const response: DraftStatsResponse = {
    filters: {
      format: options.format,
      ruleset: options.ruleset,
    },
    splitBy,
    totalTeams,
    sortedPokemon,
    draftedPokemonCount: rows.reduce((sum, r) => sum + r.total, 0),
    uniquePokemonCount: rows.length,
  };

  draftStatsCache.set(cacheKey, response);
  return response;
}
