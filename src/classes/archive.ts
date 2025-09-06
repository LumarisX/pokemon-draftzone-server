import { Types } from "mongoose";
import { FormatId } from "../data/formats";
import { RulesetId } from "../data/rulesets";
import {
  ArchiveData,
  ArchiveDocument,
  ArchiveModel,
} from "../models/archive.model";
import { DraftData } from "../models/draft.model";
import { MatchData, MatchStatData } from "../models/matchup.model";
import { getMatchups } from "../services/database-services/draft.services";

export class ArchiveOld {
  constructor(
    private draft: DraftData & {
      _id: Types.ObjectId;
    }
  ) {}

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
      team: this.draft.team.map((pokemon) => ({ id: pokemon.id })),
      matches: [],
    };
    const matchups = await getMatchups(this.draft._id);
    data.matches = matchups.map((matchup) => {
      let [winner, score] = this.matchupScore(matchup.matches!);

      return {
        teamName: "teamName" in matchup.bTeam ? matchup.bTeam.teamName : "", //temp
        stage: matchup.stage,
        score: score,
        winner: winner,
        replays: matchup.matches!.map((match) => match.replay),
        stats: this.matchupStats(matchup.matches!),
      };
    });

    return data;
  }

  matchupScore(
    matches: MatchData[]
  ): ["a" | "b" | undefined, [number, number]] {
    let winner: "a" | "b" | undefined;
    let score: [number, number] = [0, 0];
    if (matches.length > 1) {
      score = [
        matches.reduce(
          (sum, match) => (sum += match.winner === "a" ? 1 : 0),
          0
        ),
        matches.reduce(
          (sum, match) => (sum += match.winner === "b" ? 1 : 0),
          0
        ),
      ];
      if (score[0] > score[1]) winner = "a";
      if (score[1] > score[0]) winner = "b";
    } else if (matches.length > 0) {
      score = [matches[0].aTeam.score, matches[0].bTeam.score];
      winner = matches[0].winner;
    }
    return [winner, score];
  }

  private matchupStats(matches: MatchData[]): MatchStatData[] {
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
      for (let id in stat) {
        if (id in stats) {
          stats[id].brought =
            (stats[id].brought || 0) + (stat[id].brought || 0);
          stats[id].deaths = (stats[id].deaths || 0) + (stat[id].deaths || 0);
          stats[id].kills = (stats[id].kills || 0) + (stat[id].kills || 0);
          stats[id].indirect =
            (stats[id].indirect || 0) + (stat[id].indirect || 0);
        } else {
          stats[id] = stat[id];
        }
      }
    });
    return Object.entries(stats);
  }
}
