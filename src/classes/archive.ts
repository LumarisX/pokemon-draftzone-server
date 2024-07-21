import { match } from "assert";
import { FormatId } from "../data/formats";
import { RulesetId } from "../data/rulesets";
import {
  ArchiveData,
  ArchiveDocument,
  ArchiveModel,
} from "../models/archive.model";
import { DraftDocument } from "../models/draft.model";
import { getMatchups } from "../services/database-services/draft.services";
import { stat } from "fs";

export class Archive {
  constructor(private draft: DraftDocument) {}

  async createArchive(): Promise<ArchiveDocument> {
    const data = await this.prepareData();
    const model = new ArchiveModel(data);
    return model;
  }

  private async prepareData(): Promise<ArchiveData> {
    const data: ArchiveData = {
      leagueName: this.draft.leagueName,
      format: this.draft.format as FormatId,
      teamName: this.draft.teamName,
      ruleset: this.draft.ruleset as RulesetId,
      owner: this.draft.owner,
      team: this.draft.team.map((pokemon) => ({ pid: pokemon.pid })),
      matches: [],
    };
    const matchups = await getMatchups(this.draft._id);
    data.matches = matchups.map((matchup) => ({
      teamName: matchup.bTeam.teamName,
      stage: matchup.stage,
      score: [
        matchup.matches.reduce((sum, match) => (sum += match.aTeam.score), 0),
        matchup.matches.reduce((sum, match) => (sum += match.aTeam.score), 0),
      ],
      replays: matchup.matches.map((match) => match.replay),
      stats: this.prepareStats(matchup.matches),
    }));

    return data;
  }

  private prepareMatch(matchup: any): any {
    return {
      stage: matchup.stage,
      replay: matchup.replay,
      teamName: matchup.bTeam.teamName,
      aTeam: this.prepareStats(matchup.aTeam),
      bTeam: this.prepareStats(matchup.bTeam),
    };
  }

  private prepareStats(
    matches: {
      aTeam: {
        stats: [
          string,
          {
            indirect?: number;
            kills?: number;
            deaths?: number;
            brought?: number;
          }
        ][];
        score: number;
      };
      bTeam: {
        stats: [
          string,
          {
            indirect?: number;
            kills?: number;
            deaths?: number;
            brought?: number;
          }
        ][];
        score: number;
      };
      replay?: string;
      winner?: "a" | "b" | null;
    }[]
  ): any {
    let stats: {
      [key: string]: {
        indirect?: number;
        kills?: number;
        deaths?: number;
        brought?: number;
      };
    } = {};
    matches.forEach((match) => {
      let stat = Object.fromEntries(match.aTeam.stats);
      for (let pid in stat) {
        if (pid in stats) {
          stats[pid].brought =
            (stats[pid].brought || 0) + (stat[pid].brought || 0);
          stats[pid].deaths =
            (stats[pid].deaths || 0) + (stat[pid].deaths || 0);
          stats[pid].deaths = (stats[pid].kills || 0) + (stat[pid].kills || 0);
          stats[pid].indirect =
            (stats[pid].indirect || 0) + (stat[pid].indirect || 0);
        } else {
          stats[pid] = stat[pid];
        }
      }
    });
    return Object.entries(stats);
  }
}
