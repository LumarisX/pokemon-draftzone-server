import { Types } from "mongoose";
import LeagueTeamModel, {
  LeagueTeamDocument,
  LeagueTeam,
} from "../../models/league/team.model";
import { LeagueCoachDocument } from "../../models/league/coach.model";

export class LeagueTeamLoader {
  private teamId: Types.ObjectId;
  private _team: LeagueTeamDocument | null = null;

  constructor(teamId: string | Types.ObjectId) {
    this.teamId =
      typeof teamId === "string" ? new Types.ObjectId(teamId) : teamId;
  }

  public async load(): Promise<LeagueTeamDocument | null> {
    if (this._team) {
      return this._team;
    }

    this._team = await LeagueTeamModel.findById(this.teamId)
      .populate<{ coach: LeagueCoachDocument }>("coach")
      .exec();

    return this._team;
  }

  public get team(): LeagueTeamDocument | null {
    return this._team;
  }

  public get name(): string | undefined {
    const coach = this._team?.coach as LeagueCoachDocument | undefined;
    return coach?.teamName;
  }

  public get coach(): (Types.ObjectId | LeagueCoachDocument) | undefined {
    return this._team?.coach;
  }

  // // Add other getters as needed for team properties
  // public get logoUrl(): string | undefined {
  //   return this._team?.logo;
  // }

  public get picks(): LeagueTeam["picks"] | undefined {
    return this._team?.picks;
  }

  public get draft(): LeagueTeam["draft"] | undefined {
    return this._team?.draft;
  }
}
