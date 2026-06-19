import { Types } from "mongoose";
import { DraftSpecie } from "../../../../classes/pokemon";
import { Format } from "@core/data/formats/formats";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
import { toID } from "@pkmn/data";

export interface TournamentScore {
  wins: number;
  losses: number;
  diff: string;
}

export class ExternalTournament {
  _id?: Types.ObjectId;
  ruleset: Ruleset;
  format: Format;
  leagueName: string;
  teamName: string;
  key: string;
  owner: string;
  team: DraftSpecie[];
  doc?: string;
  matchups: ExternalMatchup[];
  constructor(
    props: {
      _id?: Types.ObjectId;
      ruleset: Ruleset;
      format: Format;
      leagueName: string;
      teamName: string;
      key: string;
      owner: string;
      team: DraftSpecie[];
      doc?: string;
    },
    matchups: ExternalMatchup[],
  ) {
    this._id = props._id;
    this.ruleset = props.ruleset;
    this.format = props.format;
    this.leagueName = props.leagueName;
    this.teamName = props.teamName;
    this.key = props.key;
    this.owner = props.owner;
    this.team = props.team;
    this.matchups = matchups;
  }
}
