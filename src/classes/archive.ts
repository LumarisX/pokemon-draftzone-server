import { Types } from "mongoose";
import { FormatId } from "../data/formats";
import { RulesetId } from "../data/rulesets";
import {
  ArchiveV2Data,
  ArchiveV2Model,
  StatData,
} from "../models/draft/archive.model";
import { DraftData } from "../models/draft/draft.model";
import { MatchData } from "../models/draft/matchup.model";
import { getMatchupsByDraftId } from "../services/database-services/matchup.service";

export class Archive {
  constructor(
    private draft: DraftData & {
      _id: Types.ObjectId;
    },
  ) {}

  async createArchive() {
    const data = await this.prepareData();
    const model = new ArchiveV2Model(data);
    return model;
  }

  private async prepareData(): Promise<ArchiveV2Data> {
    const data: ArchiveV2Data = {
      archiveType: "ArchiveV2",
      leagueName: this.draft.leagueName,
      leagueId: this.draft.leagueId,
      format: this.draft.format as FormatId,
      teamName: this.draft.teamName,
      ruleset: this.draft.ruleset as RulesetId,
      owner: this.draft.owner,
      team: this.draft.team.map((pokemon) => ({ id: pokemon.id })),
      matchups: [],
      stats: new Map<string, StatData>(),
      score: { wins: 0, loses: 0, diff: "0" },
    };
    const matchups = await getMatchupsByDraftId(this.draft._id);
    data.matchups = matchups.map((matchup) => ({
      teamName: matchup.bTeam.teamName,
      stage: matchup.stage,
      matches: matchup.matches,
      team: matchup.bTeam.team,
      coach: matchup.bTeam.coach,
      pastes: { aTeam: matchup.aTeam.paste, bTeam: matchup.bTeam.paste },
      stats: this.matchupStats(matchup.matches),
    }));
    data.stats = this.leagueStats(data.matchups);
    data.score = this.leagueScore(data.matchups);
    return data;
  }

  matchupStats(matches: MatchData[]): {
    winner: "a" | "b" | undefined;
    aTeam: {
      wins: number;
      stats: Map<string, StatData>;
      differential: number;
    };
    bTeam: {
      wins: number;
      stats: Map<string, StatData>;
      differential: number;
    };
  } {
    if (!matches || matches.length === 0)
      return {
        winner: undefined,
        aTeam: {
          stats: new Map<string, StatData>(),
          wins: 0,
          differential: 0,
        },
        bTeam: {
          stats: new Map<string, StatData>(),
          wins: 0,
          differential: 0,
        },
      };

    const teamStats = (matches: MatchData[], team: "aTeam" | "bTeam") => {
      const pokemonMap = new Map<
        string,
        { brought: number; kills: number; deaths: number; indirect: number }
      >();
      let wins = 0;
      let differential = 0;
      for (const match of matches) {
        for (const [pid, stats] of match[team].stats) {
          const existing = pokemonMap.get(pid);
          if (existing) {
            pokemonMap.set(pid, {
              brought: existing.brought + (stats?.brought ? 1 : 0),
              kills: existing.kills + (stats?.kills ?? 0),
              deaths: existing.deaths + (stats?.deaths ? 1 : 0),
              indirect: existing.indirect + (stats?.indirect ?? 0),
            });
          } else {
            pokemonMap.set(pid, {
              brought: stats?.brought ? 1 : 0,
              kills: stats?.kills ?? 0,
              deaths: stats?.deaths ? 1 : 0,
              indirect: stats?.indirect ?? 0,
            });
          }
        }
        if (
          (match.winner === "a" && team === "aTeam") ||
          (match.winner === "b" && team === "bTeam")
        )
          wins++;

        differential += match[team].score;
      }

      // prune zero fields and convert to Map<string, NewStatData>
      const result = new Map<string, StatData>();
      for (const [pid, vals] of pokemonMap.entries()) {
        const pruned: StatData = {};
        if (vals.brought) pruned.brought = vals.brought;
        if (vals.kills) pruned.kills = vals.kills;
        if (vals.deaths) pruned.deaths = vals.deaths;
        if (vals.indirect) pruned.indirect = vals.indirect;
        result.set(pid, pruned);
      }
      return { stats: result, wins, differential };
    };

    const wins = matches.reduce(
      (acc, m) => {
        if (m.winner === "a") acc[0]++;
        else if (m.winner === "b") acc[1]++;
        return acc;
      },
      [0, 0] as [number, number],
    );

    let winner: "a" | "b" | undefined;
    if (wins[0] > wins[1]) winner = "a";
    else if (wins[1] > wins[0]) winner = "b";

    return {
      winner,
      aTeam: teamStats(matches, "aTeam"),
      bTeam: teamStats(matches, "bTeam"),
    };
  }

  private leagueStats(matches: ArchiveV2Data["matchups"]) {
    const stats = new Map<string, StatData>();
    for (const matchup of matches) {
      for (const [pid, pdata] of matchup.stats.aTeam.stats.entries()) {
        const existing = stats.get(pid) ?? {
          brought: 0,
          kills: 0,
          deaths: 0,
          indirect: 0,
        };
        existing.brought = (existing.brought ?? 0) + (pdata.brought ?? 0);
        existing.kills = (existing.kills ?? 0) + (pdata.kills ?? 0);
        existing.deaths = (existing.deaths ?? 0) + (pdata.deaths ?? 0);
        existing.indirect = (existing.indirect ?? 0) + (pdata.indirect ?? 0);
        stats.set(pid, existing);
      }
    }
    for (const [pid, pdata] of Array.from(stats.entries())) {
      const pruned: StatData = {};
      if (pdata.brought) pruned.brought = pdata.brought;
      if (pdata.kills) pruned.kills = pdata.kills;
      if (pdata.deaths) pruned.deaths = pdata.deaths;
      if (pdata.indirect) pruned.indirect = pdata.indirect;
      stats.set(pid, pruned);
    }
    return stats;
  }

  private leagueScore(matches: ArchiveV2Data["matchups"]) {
    let wins = 0;
    let losses = 0;
    let diff = 0;
    for (const matchup of matches) {
      if (matchup.stats.winner === "a") {
        wins++;
      } else if (matchup.stats.winner === "b") {
        losses++;
      }
      diff +=
        matchup.stats.aTeam.differential - matchup.stats.bTeam.differential;
    }
    return { wins, loses: losses, diff: diff.toString() };
  }
}
