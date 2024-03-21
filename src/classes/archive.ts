import { FormatId } from "../data/formats";
import { RulesetId } from "../data/rulesets";
import { ArchiveDocument, ArchiveModel } from "../models/archive.model";
import { DraftData, DraftDocument } from "../models/draft.model";
import { getMatchups } from "../services/database-services/draft.services";

interface ArchiveDoc {
  leagueName: string;
  format: FormatId;
  teamName: string;
  ruleset: RulesetId;
  owner: string;
  team: string[];
  matches: {
    stage: string;
    replay: string | undefined | null;
    teamName: string | undefined | null;
    aTeam: {
      score: number;
      paste: string | undefined | null;
      stats:
        | Record<
            string,
            {
              indirect?: number | null | undefined;
              kills?: number | null | undefined;
              deaths?: number | null | undefined;
              brought?: number | null | undefined;
            }
          >
        | null
        | undefined;
    };
    bTeam: {
      score: number;
      paste: string | undefined | null;
      stats:
        | Record<
            string,
            {
              indirect?: number | null | undefined;
              kills?: number | null | undefined;
              deaths?: number | null | undefined;
              brought?: number | null | undefined;
            }
          >
        | null
        | undefined;
    };
  }[];
}

class Archive {
  constructor(private draft: DraftDocument) {}

  async createArchive(): Promise<ArchiveDocument> {
    const data = await this.prepareData();
    const model = new ArchiveModel(data);
    return model;
  }

  private async prepareData(): Promise<ArchiveDoc> {
    const data: ArchiveDoc = {
      leagueName: this.draft.leagueName,
      format: this.draft.format as FormatId,
      teamName: this.draft.teamName,
      ruleset: this.draft.ruleset as RulesetId,
      owner: this.draft.owner,
      team: this.draft.team.map((pokemon) => pokemon.pid),
      matches: [],
    };
    const matchups = await getMatchups(this.draft._id);
    data.matches = matchups.map((matchup) => this.prepareMatch(matchup));
    return data;
  }

  private prepareMatch(matchup: any): any {
    return {
      stage: matchup.stage,
      replay: matchup.replay,
      teamName: matchup.bTeam.teamName,
      aTeam: this.prepareTeam(matchup.aTeam),
      bTeam: this.prepareTeam(matchup.bTeam),
    };
  }

  private prepareTeam(team: any): any {
    return {
      score: team.score,
      paste: team.paste,
      stats: team.stats,
    };
  }
}

export = Archive;
