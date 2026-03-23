import { z } from "zod";
import { DraftSpecie } from "../classes/pokemon";
import { _getFormats, getFormat, getFormats } from "../data/formats";
import { getRuleset, getRulesets, getRulesetsGrouped } from "../data/rulesets";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { getRandom } from "../services/data-services/pokedex.service";
import { getLeagueAds } from "../services/league-ad/league-ad-service";
import { getNews } from "../services/news/news-service";
import {
  parseSearchRequest,
  searchPokemonWithMetadata,
  type SearchPokemonOptions,
} from "../services/search-services/search.service";
import { searchPokemon as searchPokemonOld } from "../services/search.service";
import { parseTime } from "../util";
import { createRoute } from "./route-builder";

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

function normalizeSearchInput(input: unknown): string | SearchPokemonOptions {
  if (typeof input === "string") {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as SearchPokemonOptions;
  }

  return "";
}

export const DataRoute = createRoute()((r) => {
  r.path("formats")((r) => {
    r.get((ctx) => getFormats());
  });
  r.path("formatsgrouped")((r) => {
    r.get((ctx) => _getFormats());
  });
  r.path("rulesets")((r) => {
    r.get((ctx) => getRulesets());
  });
  r.path("rulesetsgrouped")((r) => {
    r.get((ctx) => getRulesetsGrouped());
  });
  r.path("advancesearch")((r) => {
    r.get.validate({
      query: (data) =>
        z
          .object({ ruleset: z.string().optional(), query: z.string() })
          .parse(data),
    })(async (ctx) => {
      let { ruleset, query } = ctx.validatedQuery;
      query = decodeURIComponent(query);
      return ruleset
        ? await searchPokemonOld(query, ruleset)
        : await searchPokemonOld(query);
    });
  });
  r.path("pokemonsearch")((r) => {
    // r.get.validate({
    //   query: (data) =>
    //     z
    //       .object({ ruleset: z.string().optional(), query: z.string() })
    //       .parse(data),
    // })(async (ctx) => {
    //   const ruleset = getRuleset(ctx.validatedQuery.ruleset || "Gen9 NatDex");
    //   const query = normalizeSearchInput(ctx.validatedQuery.query);
    //   const options = parseSearchRequest(query);
    //   const { results, total, limit, offset } = await searchPokemonWithMetadata(
    //     ruleset,
    //     options,
    //   );
    //   return {
    //     results: await Promise.all(
    //       results.map(async (specie) => {
    //         const coverage = await specie.coverage();
    //         const baseStats = specie.baseStats;
    //         return {
    //           id: specie.id,
    //           name: specie.name,
    //           baseSpecies: specie.baseSpecies,
    //           gen: specie.gen,
    //           isNonstandard: specie.isNonstandard ?? "",
    //           types: [...specie.types],
    //           abilities: specie.getAbilities(),
    //           weaks: specie.getWeak(),
    //           resists: specie.getResists(),
    //           immunities: specie
    //             .getImmune()
    //             .map((immunity) => IMMUNITY_LABEL_MAP[immunity] || immunity),
    //           baseStats,
    //           hp: baseStats.hp,
    //           atk: baseStats.atk,
    //           def: baseStats.def,
    //           spa: baseStats.spa,
    //           spd: baseStats.spd,
    //           spe: baseStats.spe,
    //           weightkg: specie.weightkg,
    //           tier: specie.tier,
    //           natDexTier: specie.natDexTier,
    //           doublesTier: specie.doublesTier,
    //           eggGroups: [...specie.eggGroups],
    //           nfe: specie.nfe,
    //           evolved: !specie.nfe,
    //           isMega: Boolean(specie.isMega),
    //           isPrimal: Boolean(specie.isPrimal),
    //           isGigantamax: Boolean(specie.isGigantamax),
    //           prevo: specie.prevo ?? "",
    //           evos: specie.evos ?? [],
    //           requiredAbility: specie.requiredAbility ?? "",
    //           requiredItem: specie.requiredItem
    //             ? [specie.requiredItem]
    //             : specie.requiredItems,
    //           requiredMove: specie.requiredMove ?? "",
    //           coverage: [...coverage.physical, ...coverage.special].map(
    //             (move) => move.name,
    //           ),
    //           num: specie.num,
    //           tags: [...specie.tags],
    //           bst: specie.bst,
    //           cst: specie.cst,
    //         };
    //       }),
    //     ),
    //     total,
    //     limit,
    //     offset,
    //   };
    // });

    r.post.validate({
      body: (data) =>
        z
          .object({
            ruleset: z.string().optional(),
            query: z.union([z.string(), z.object({}).loose()]),
          })
          .parse(data),
    })(async (ctx) => {
      const ruleset = getRuleset(ctx.validatedBody.ruleset || "Gen9 NatDex");
      const query = normalizeSearchInput(ctx.validatedBody.query);
      const options = parseSearchRequest(query);
      const { results, total, limit, offset } = await searchPokemonWithMetadata(
        ruleset,
        options,
      );
      return {
        results: await Promise.all(
          results.map(async (specie) => {
            const coverage = await specie.coverage();
            const baseStats = specie.baseStats;
            return {
              id: specie.id,
              name: specie.name,
              baseSpecies: specie.baseSpecies,
              gen: specie.gen,
              isNonstandard: specie.isNonstandard ?? "",
              types: [...specie.types],
              abilities: specie.getAbilities(),
              weaks: specie.getWeak(),
              resists: specie.getResists(),
              immunities: specie
                .getImmune()
                .map((immunity) => IMMUNITY_LABEL_MAP[immunity] || immunity),
              baseStats,
              hp: baseStats.hp,
              atk: baseStats.atk,
              def: baseStats.def,
              spa: baseStats.spa,
              spd: baseStats.spd,
              spe: baseStats.spe,
              weightkg: specie.weightkg,
              tier: specie.tier,
              natDexTier: specie.natDexTier,
              doublesTier: specie.doublesTier,
              eggGroups: [...specie.eggGroups],
              nfe: specie.nfe,
              evolved: !specie.nfe,
              isMega: Boolean(specie.isMega),
              isPrimal: Boolean(specie.isPrimal),
              isGigantamax: Boolean(specie.isGigantamax),
              prevo: specie.prevo ?? "",
              evos: specie.evos ?? [],
              requiredAbility: specie.requiredAbility ?? "",
              requiredItem: specie.requiredItem
                ? [specie.requiredItem]
                : specie.requiredItems,
              requiredMove: specie.requiredMove ?? "",
              coverage: [...coverage.physical, ...coverage.special].map(
                (move) => move.name,
              ),
              num: specie.num,
              tags: [...specie.tags],
              bst: specie.bst,
              cst: specie.cst,
            };
          }),
        ),
        total,
        limit,
        offset,
      };
    });
  });
  r.path("listpokemon")((r) => {
    r.get.validate({
      query: (data) => z.object({ ruleset: z.string() }).parse(data),
    })(async (ctx) => {
      const { ruleset: rulesetId } = ctx.validatedQuery;
      const ruleset = getRuleset(rulesetId);
      return await Promise.all(
        Array.from(ruleset.species).map(async (s) => {
          const specie = new DraftSpecie(s, ruleset);
          const coverage = await specie.coverage();
          const baseStats = specie.baseStats;
          return {
            id: specie.id,
            name: specie.name,
            baseSpecies: specie.baseSpecies,
            gen: specie.gen,
            isNonstandard: specie.isNonstandard ?? "",
            types: [...specie.types],
            abilities: specie.getAbilities(),
            weaks: specie.getWeak(),
            resists: specie.getResists(),
            immunities: specie
              .getImmune()
              .map((immunity) => IMMUNITY_LABEL_MAP[immunity] || immunity),
            baseStats,
            hp: baseStats.hp,
            atk: baseStats.atk,
            def: baseStats.def,
            spa: baseStats.spa,
            spd: baseStats.spd,
            spe: baseStats.spe,
            weightkg: specie.weightkg,
            tier: specie.tier,
            natDexTier: specie.natDexTier,
            doublesTier: specie.doublesTier,
            eggGroups: [...specie.eggGroups],
            nfe: specie.nfe,
            evolved: !specie.nfe,
            isMega: Boolean(specie.isMega),
            isPrimal: Boolean(specie.isPrimal),
            isGigantamax: Boolean(specie.isGigantamax),
            prevo: specie.prevo ?? "",
            evos: specie.evos ?? [],
            requiredAbility: specie.requiredAbility ?? "",
            requiredItem: specie.requiredItem
              ? [specie.requiredItem]
              : specie.requiredItems,
            requiredMove: specie.requiredMove ?? "",
            coverage: [...coverage.physical, ...coverage.special].map(
              (move) => move.name,
            ),
            num: specie.num,
            tags: [...specie.tags],
            bst: specie.bst,
            cst: specie.cst,
          };
        }),
      );
    });
  });
  r.path("unread-counts")((r) => {
    r.get.validate({
      query: (data) =>
        z.record(z.string(), z.union([z.string(), z.number()])).parse(data),
    })(async (ctx) => {
      const timeEntries = Object.entries(ctx.validatedQuery);
      const results = await Promise.all(
        timeEntries.map(
          async ([type, timeString]): Promise<[string, number]> => {
            const time = parseTime(timeString);
            if (!time) return [type, -1];
            switch (type) {
              case "leagueAd":
                const leagues = await getLeagueAds();
                return [type, leagues.filter((l) => l.createdAt > time).length];
              case "news":
                const news = await getNews();
                return [type, news.filter((n) => n.createdAt > time).length];
              default:
                return [type, -1];
            }
          },
        ),
      );
      const counts = Object.fromEntries(results);
      return counts;
    });
  });
  r.path("random")((r) => {
    r.get.validate({
      query: (data) =>
        z
          .object({
            ruleset: z.string(),
            format: z.string(),
            count: z.coerce.number().min(1).max(20),
            banned: z.union([z.string(), z.array(z.string())]).optional(),
            tier: z.string().optional(),
          })
          .parse(data),
    })((ctx) => {
      const {
        ruleset: rulesetId,
        format: formatId,
        count,
        banned,
        tier,
      } = ctx.validatedQuery;
      const ruleset = getRuleset(rulesetId);
      const format = getFormat(formatId);
      const randomMons = getRandom(count, ruleset, format, {
        banned: Array.isArray(banned)
          ? (banned as string[])
          : typeof banned === "string"
            ? [banned]
            : undefined,
        tier,
      });
      return randomMons.map((pokemon) => ({
        ...pokemon,
        level: format.level,
      }));
    });
    r.param("ruleset", (ctx, ruleset) => ({
      ruleset: getRuleset(ruleset),
    }))((r) => {
      r.param("pid", (ctx, pid) => {
        const species = ctx.ruleset.species.get(pid);
        if (!species)
          throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, {
            pid,
          });
        return { species };
      })((r) => {
        r.path("formes")((r) => {
          r.get((ctx) => {
            const { ruleset, species } = ctx;

            let formeNames = [] as string[];
            if (species.formes) formeNames = species.formes;
            if (species.changesFrom) {
              const basePokemon = ruleset.species.get(species.changesFrom);
              if (!basePokemon || !basePokemon.formes) return [];
              formeNames = basePokemon.formes;
            }
            const formes = formeNames
              .map((formeName) => {
                const specie = ruleset.species.get(formeName);
                return specie ? { id: specie.id, name: specie.name } : null;
              })
              .filter((forme) => forme !== null && forme.id !== species.id);
            return formes;
          });
        });
      });
    });
  });
});
