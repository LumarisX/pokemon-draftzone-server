import { Specie } from "@pkmn/data";
import { Request, Response } from "express";
import { Route } from ".";
import { _getFormats, getFormat, getFormats } from "../data/formats";
import {
  getRuleset,
  getRulesets,
  getRulesetsGrouped,
  Ruleset,
} from "../data/rulesets";
import { getRandom } from "../services/data-services/pokedex.service";
import { searchPokemon } from "../services/search.service";
// import { getApprovedLeagues } from "../services/league-ad/league-ad-service";
import { parseTime } from "../util";
import { getNews } from "../services/news/news-service";

type DataResponse = Response & { ruleset?: Ruleset };

export const DataRoutes: Route = {
  subpaths: {
    "/formats": {
      get: (req: Request, res: Response) => {
        try {
          res.json(getFormats());
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R1-01" });
        }
      },
    },
    "/formatsgrouped": {
      get: (req: Request, res: Response) => {
        try {
          res.json(_getFormats());
        } catch (error) {
          console.error("Error in /formats/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R1-01" });
        }
      },
    },
    "/rulesets": {
      get: (req: Request, res: Response) => {
        try {
          res.json(getRulesets());
        } catch (error) {
          console.error("Error in /rulesets/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R2-01" });
        }
      },
    },
    "/rulesetsgrouped": {
      get: (req: Request, res: Response) => {
        try {
          res.json(getRulesetsGrouped());
        } catch (error) {
          console.error("Error in /rulesets/ route:", error);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R2-01" });
        }
      },
    },
    "/advancesearch": {
      get: async (req: Request, res: DataResponse) => {
        try {
          let ruleset = req.query.ruleset;
          let query = req.query.query;
          if (typeof query == "string") {
            query = decodeURIComponent(query);
            if (typeof ruleset === "string")
              res.json(await searchPokemon(query, ruleset));
            else res.json(await searchPokemon(query));
          } else {
            res
              .status(400)
              .json({ error: "Query type error", code: "DT-R3-01" });
          }
        } catch (error) {
          console.error(
            `Error in /search route: ${
              (error as Error).message
            }\nSearch query: ${req.query.query}`
          );
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R3-02" });
        }
      },
    },
    "/listpokemon": {
      get: async (req: Request, res: DataResponse) => {
        try {
          const rulesetId = req.query.ruleset;
          if (typeof rulesetId === "string") {
            const ruleset = getRuleset(rulesetId);
            return res.json(
              Array.from(ruleset.species)
                .sort((a, b) => a.num - b.num)
                .map((specie) => ({
                  name: specie.name,
                  id: specie.id,
                }))
            );
          }
          return res
            .status(400)
            .json({ error: "Query type error", code: "DT-R3-01" });
        } catch (error) {
          console.error(
            `Error in /listpokemon route: ${
              (error as Error).message
            }\nSearch query: ${req.query.query}`
          );
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R3-02" });
        }
      },
    },
    // "/unread-counts": {
    //   get: async (req: Request, res: Response) => {
    //     try {
    //       const timeEntries = Object.entries(req.query) as [
    //         string,
    //         string | number
    //       ][];

    //       const results = await Promise.all(
    //         timeEntries.map(
    //           async ([type, timeString]): Promise<[string, number]> => {
    //             const time = parseTime(timeString);
    //             if (!time) return [type, -1];
    //             switch (type) {
    //               case "leagueAd":
    //                 const leagues = await getApprovedLeagues();
    //                 return [
    //                   type,
    //                   leagues.filter((l) => l.createdAt > time).length,
    //                 ];
    //               case "news":
    //                 const news = await getNews();
    //                 return [
    //                   type,
    //                   news.filter((n) => n.createdAt > time).length,
    //                 ];
    //               default:
    //                 return [type, -1];
    //             }
    //           }
    //         )
    //       );

    //       const counts = Object.fromEntries(results);
    //       res.json(counts);
    //     } catch (error) {
    //       console.error(error);
    //       res
    //         .status(500)
    //         .json({ message: (error as Error).message, code: "DT-R4-01" });
    //     }
    //   },
    // },
    "/random": {
      get: async (req: Request, res: DataResponse) => {
        try {
          let rulesetId = req.query.ruleset;
          let formatId = req.query.format;
          if (
            typeof req.query.count == "string" ||
            typeof req.query.count == "number"
          ) {
            const count = +req.query.count;
            if (
              typeof rulesetId === "string" &&
              typeof formatId === "string" &&
              count > 0 &&
              count <= 20
            ) {
              const ruleset = getRuleset(rulesetId);
              const format = getFormat(formatId);
              const randomMons = getRandom(count, ruleset, format, {
                banned: Array.isArray(req.query.banned)
                  ? (req.query.banned as string[])
                  : typeof req.query.banned === "string"
                  ? [req.query.banned]
                  : undefined,
                tier:
                  typeof req.query.tier === "string"
                    ? req.query.tier
                    : undefined,
              });
              return res.json(
                randomMons.map((pokemon) => ({
                  ...pokemon,
                  level: format.level,
                }))
              );
            }
          }
          return res
            .status(400)
            .json({ error: "Query type error", code: "DT-R3-01" });
        } catch (error) {
          console.error(
            `Error in /random route: ${
              (error as Error).message
            }\nRandom query: ${req.query.query}`
          );
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R3-02" });
        }
      },
    },
    "/:ruleset/:pid/formes": {
      get: async (req, res) => {
        const ruleset: Ruleset = res.locals.ruleset;
        const pokemonData: Specie = res.locals.pokemonData;
        try {
          let formeNames = [] as string[];
          if (pokemonData.formes) formeNames = pokemonData.formes;
          if (pokemonData.changesFrom) {
            const basePokemon = ruleset.species.get(pokemonData.changesFrom);
            if (!basePokemon || !basePokemon.formes) return;
            formeNames = basePokemon.formes;
          }
          const formes = formeNames
            .map((formeName) => {
              const specie = ruleset.species.get(formeName);
              return specie ? { id: specie.id, name: specie.name } : null;
            })
            .filter((forme) => forme !== null && forme.id !== pokemonData.id);
          return res.json(formes);
        } catch (error) {
          console.error(`Error in forme route: ${(error as Error).message}`);
          res
            .status(500)
            .json({ error: "Internal Server Error", code: "DT-R4-02" });
        }
      },
    },
  },
  params: {
    ruleset: async (req: Request, res: Response, next) => {
      res.locals.ruleset = getRuleset(req.params.ruleset);
      next();
    },
    pid: async (req: Request, res: Response, next) => {
      res.locals.pokemonData = (res.locals.ruleset as Ruleset).species.get(
        req.params.pid
      );
      if (!res.locals.pokemonData) {
        return res
          .status(404)
          .json({ error: "Pokémon not found.", code: "DT-R4-01" });
      }
      next();
    },
  },
};
