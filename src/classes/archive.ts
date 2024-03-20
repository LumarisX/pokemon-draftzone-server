import { FormatId } from "../public/data/formats";
import { RulesetId } from "../public/data/rulesets";
import { getMatchups } from "../services/database-services/draft.services";

interface ArchiveModel {
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
  constructor(
    private draft: {
      leagueName: string;
      format: FormatId;
      teamName: string;
      ruleset: RulesetId;
      owner: string;
      team: { pid: string }[];
      _id: any;
    }
  ) {}

  async createArchive(): Promise<ArchiveModel> {
    const data = await this.prepareData();
    return data;
  }

  private async prepareData(): Promise<ArchiveModel> {
    const { leagueName, format, teamName, ruleset, owner, team, _id } =
      this.draft;
    const data: ArchiveModel = {
      leagueName,
      format,
      teamName,
      ruleset,
      owner,
      team: team.map((pokemon) => pokemon.pid),
      matches: [],
    };
    const matchups = await getMatchups(_id);
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
