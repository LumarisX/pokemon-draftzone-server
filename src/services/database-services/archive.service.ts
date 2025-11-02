import { ID, toID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { ArchiveV1Data, ArchiveV2Data } from "../../models/draft/archive.model";
import { getName } from "../data-services/pokedex.service";

export async function getStats(
  ruleset: Ruleset,
  archive: ArchiveV1Data | ArchiveV2Data
): Promise<
  {
    pokemon: { id: ID; name: string };
    kills: number;
    brought: number;
    indirect: number;
    deaths: number;
    kdr: number;
    kpg: number;
  }[]
> {
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
  if (archive.archiveType === "ArchiveV2") {
    return Array.from(archive.stats, ([pid, statData]) => ({
      pokemon: { id: toID(pid), name: getName(pid) },
      kills: statData.kills ?? 0,
      brought: statData.brought ?? 0,
      indirect: statData.indirect ?? 0,
      deaths: statData.deaths ?? 0,
      kdr:
        (statData.kills ?? 0) +
        (statData.indirect ?? 0) -
        (statData.deaths ?? 0),
      kpg:
        (statData.brought ?? 0) > 0
          ? ((statData.kills ?? 0) + (statData.indirect ?? 0)) /
            (statData.brought ?? 0)
          : 0,
    }));
  } else {
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
}
