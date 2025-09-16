import { Types } from "mongoose";
import LeagueTeamModel, {
  LeagueTeamDocument,
  LeagueTeam,
} from "../../models/league/team.model";
import { LeagueUserDocument } from "../../models/league/user.model";

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
      .populate<{ coaches: LeagueUserDocument[] }>("coaches")
      .exec();

    return this._team;
  }

  public get team(): LeagueTeamDocument | null {
    return this._team;
  }

  public get name(): string | undefined {
    return this._team?.name;
  }

  public get coaches(): (Types.ObjectId | LeagueUserDocument)[] | undefined {
    return this._team?.coaches;
  }

  // Add other getters as needed for team properties
  public get logoUrl(): string | undefined {
    return this._team?.logoUrl;
  }

  public get picks(): LeagueTeam["picks"] | undefined {
    return this._team?.picks;
  }

  public get draft(): LeagueTeam["draft"] | undefined {
    return this._team?.draft;
  }
}
