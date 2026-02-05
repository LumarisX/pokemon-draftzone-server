import { z } from "zod";
import { _getFormats, getFormat, getFormats } from "../data/formats";
import { getRuleset, getRulesets, getRulesetsGrouped } from "../data/rulesets";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { getRandom } from "../services/data-services/pokedex.service";
import { getLeagueAds } from "../services/league-ad/league-ad-service";
import { getNews } from "../services/news/news-service";
import { searchPokemon } from "../services/search.service";
import { parseTime } from "../util";
import { createRoute } from "./route-builder";

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
        ? await searchPokemon(query, ruleset)
        : await searchPokemon(query);
    });
  });
  r.path("listpokemon")((r) => {
    r.get.validate({
      query: (data) => z.object({ ruleset: z.string() }).parse(data),
    })(async (ctx) => {
      const { ruleset: rulesetId } = ctx.validatedQuery;
      const ruleset = getRuleset(rulesetId);
      return Array.from(ruleset.species)
        .sort((a, b) => a.num - b.num)
        .map((specie) => ({
          name: specie.name,
          id: specie.id,
        }));
    });
  });
  r.path("unread-counts")((r) => {
    r.get.validate({
      query: (data) => z.record(z.string().or(z.number())).parse(data),
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
            count: z.number().min(1).max(20),
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
