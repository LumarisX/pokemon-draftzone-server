import { ID, toID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { ArchiveDocument } from "../../models/draft/archive.model";
import { getName } from "../data-services/pokedex.service";

export async function getStats(ruleset: Ruleset, archive: ArchiveDocument) {
  let stats: {
    [key: string]: {
      pokemon: { id: ID; name: string };
      kills: number;
      brought: number;
      indirect: number;
      deaths: number;
      kdr: number;
      kpg: number;
    };
  } = {};
  for (const match of archive.matches) {
    for (const [pid, matchStats] of match.stats) {
      if (!(pid in stats)) {
        stats[pid] = {
          pokemon: { id: toID(pid), name: getName(pid) },
          kills: 0,
          brought: 0,
          indirect: 0,
          deaths: 0,
          kdr: 0,
          kpg: 0,
        };
      }
      stats[pid].kills += matchStats.kills ?? 0;
      stats[pid].brought += matchStats.brought ?? 0;
      stats[pid].indirect += matchStats.indirect ?? 0;
      stats[pid].deaths += matchStats.deaths ?? 0;
    }
  }

  for (let id in stats) {
    stats[id].kdr = stats[id].kills + stats[id].indirect - stats[id].deaths;
    stats[id].kpg =
      stats[id].brought > 0
        ? (stats[id].kills + stats[id].indirect) / stats[id].brought
        : 0;
  }
  return Object.values(stats);
}
